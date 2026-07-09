#include "inkwell_pdf_bridge.h"

#include "pdfcatalog.h"
#include "pdfannotation.h"
#include "pdfcms.h"
#include "pdfconstants.h"
#include "pdfdocument.h"
#include "pdfdocumentbuilder.h"
#include "pdfdocumentwriter.h"
#include "pdffont.h"
#include "pdfmeshqualitysettings.h"
#include "pdfoptionalcontent.h"
#include "pdfpage.h"
#include "pdfprogramcontroller.h"
#include "pdfredact.h"
#include "pdfrenderer.h"
#include "pdftextlayout.h"
#include "pdftextlayoutgenerator.h"
#include "pdfundoredomanager.h"

#include <QColor>
#include <QDir>
#include <QFileInfo>
#include <QImage>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QPainter>
#include <QPointF>
#include <QPolygonF>
#include <QRectF>
#include <QSizeF>
#include <QTransform>

#include <algorithm>
#include <optional>
#include <utility>

namespace {

QString compactJson(const QJsonObject& object)
{
    return QString::fromUtf8(QJsonDocument(object).toJson(QJsonDocument::Compact));
}

std::optional<double> readNumber(const QJsonObject& object, const QString& key)
{
    const QJsonValue value = object.value(key);
    if (!value.isDouble()) return std::nullopt;
    return value.toDouble();
}

std::optional<QRectF> readRect(const QJsonValue& value)
{
    if (!value.isObject()) return std::nullopt;

    const QJsonObject rect = value.toObject();
    const std::optional<double> x0 = readNumber(rect, QStringLiteral("x0"));
    const std::optional<double> y0 = readNumber(rect, QStringLiteral("y0"));
    const std::optional<double> x1 = readNumber(rect, QStringLiteral("x1"));
    const std::optional<double> y1 = readNumber(rect, QStringLiteral("y1"));
    if (!x0 || !y0 || !x1 || !y1) return std::nullopt;

    QRectF normalized(QPointF(*x0, *y0), QPointF(*x1, *y1));
    normalized = normalized.normalized();
    if (normalized.isEmpty()) return std::nullopt;
    return normalized;
}

QColor readColor(const QJsonObject& operation)
{
    const QJsonValue value = operation.value(QStringLiteral("color"));
    if (!value.isArray()) return Qt::yellow;

    const QJsonArray components = value.toArray();
    if (components.size() < 3) return Qt::yellow;

    const double r = components.at(0).toDouble(1.0);
    const double g = components.at(1).toDouble(1.0);
    const double b = components.at(2).toDouble(0.0);
    const double maxComponent = std::max({ r, g, b });

    if (maxComponent <= 1.0) {
        return QColor::fromRgbF(
            std::clamp(r, 0.0, 1.0),
            std::clamp(g, 0.0, 1.0),
            std::clamp(b, 0.0, 1.0)
        );
    }

    return QColor(
        static_cast<int>(std::clamp(r, 0.0, 255.0)),
        static_cast<int>(std::clamp(g, 0.0, 255.0)),
        static_cast<int>(std::clamp(b, 0.0, 255.0))
    );
}

pdf::PDFReal readOpacity(const QJsonObject& operation)
{
    const QJsonValue value = operation.value(QStringLiteral("opacity"));
    if (!value.isDouble()) return 0.2;

    return std::clamp(value.toDouble(), 0.0, 1.0);
}

int pageRotationDegrees(pdf::PageRotation rotation)
{
    switch (rotation) {
    case pdf::PageRotation::Rotate90:
        return 90;
    case pdf::PageRotation::Rotate180:
        return 180;
    case pdf::PageRotation::Rotate270:
        return 270;
    case pdf::PageRotation::None:
        return 0;
    }

    return 0;
}

std::optional<pdf::PageRotation> pageRotationFromDegrees(int degrees)
{
    const int normalized = ((degrees % 360) + 360) % 360;
    switch (normalized) {
    case 0:
        return pdf::PageRotation::None;
    case 90:
        return pdf::PageRotation::Rotate90;
    case 180:
        return pdf::PageRotation::Rotate180;
    case 270:
        return pdf::PageRotation::Rotate270;
    default:
        return std::nullopt;
    }
}

void appendHighlightQuadrilateral(QPolygonF& quadrilaterals, const QRectF& rect)
{
    quadrilaterals << rect.bottomLeft();
    quadrilaterals << rect.bottomRight();
    quadrilaterals << rect.topLeft();
    quadrilaterals << rect.topRight();
}

bool isSupportedTextMarkupType(const QString& type)
{
    return type == QStringLiteral("highlight")
        || type == QStringLiteral("underline")
        || type == QStringLiteral("strikeout");
}

bool isSupportedAnnotationOperationType(const QString& type)
{
    return type == QStringLiteral("comment")
        || type == QStringLiteral("watermark")
        || type == QStringLiteral("freeText")
        || type == QStringLiteral("stamp")
        || type == QStringLiteral("imageStamp")
        || type == QStringLiteral("shape");
}

std::optional<QRectF> readPositionRectangle(const QJsonObject& operation, double defaultWidth, double defaultHeight)
{
    const std::optional<double> x = readNumber(operation, QStringLiteral("x"));
    const std::optional<double> y = readNumber(operation, QStringLiteral("y"));
    if (!x || !y) return std::nullopt;

    const double width = readNumber(operation, QStringLiteral("width")).value_or(defaultWidth);
    const double height = readNumber(operation, QStringLiteral("height")).value_or(defaultHeight);
    QRectF rect(QPointF(*x, *y), QSizeF(width, height));
    rect = rect.normalized();
    if (rect.isEmpty()) return std::nullopt;
    return rect;
}

pdf::Stamp readStampType(const QString& stamp)
{
    if (stamp == QStringLiteral("Draft")) return pdf::Stamp::Draft;
    if (stamp == QStringLiteral("Confidential")) return pdf::Stamp::Confidential;
    if (stamp == QStringLiteral("Final")) return pdf::Stamp::Final;
    if (stamp == QStringLiteral("NotApproved")) return pdf::Stamp::NotApproved;
    if (stamp == QStringLiteral("ForComment")) return pdf::Stamp::ForComment;
    if (stamp == QStringLiteral("ForPublicRelease")) return pdf::Stamp::ForPublicRelease;
    if (stamp == QStringLiteral("NotForPublicRelease")) return pdf::Stamp::NotForPublicRelease;
    if (stamp == QStringLiteral("TopSecret")) return pdf::Stamp::TopSecret;
    if (stamp == QStringLiteral("Expired")) return pdf::Stamp::Expired;
    return pdf::Stamp::Approved;
}

struct TextLayoutContext {
    pdf::PDFFontCache fontCache;
    pdf::PDFCMSGeneric cms;
    pdf::PDFMeshQualitySettings meshQualitySettings;
    pdf::PDFOptionalContentActivity optionalContentActivity;
    pdf::PDFModifiedDocument modifiedDocument;

    explicit TextLayoutContext(pdf::PDFDocument& document)
        : fontCache(pdf::DEFAULT_FONT_CACHE_LIMIT, pdf::DEFAULT_REALIZED_FONT_CACHE_LIMIT),
          optionalContentActivity(&document, pdf::OCUsage::Export, nullptr),
          modifiedDocument(&document, &optionalContentActivity)
    {
        fontCache.setDocument(modifiedDocument);
        fontCache.setCacheShrinkEnabled(nullptr, false);
    }
};

struct TextMarkupHit {
    pdf::PDFInteger pageIndex = 0;
    std::vector<QRectF> rects;
};

struct CreatedAnnotation {
    pdf::PDFObjectReference page;
    pdf::PDFObjectReference annotation;
    bool refreshAppearance = true;
};

struct PageRotationChange {
    pdf::PDFObjectReference page;
    int originalRotation = 0;
};

std::vector<QRectF> selectionRectsForItems(const pdf::PDFTextLayout& layout, const pdf::PDFTextSelectionItems& items)
{
    std::vector<QRectF> rects;
    const pdf::PDFTextBlocks& blocks = layout.getTextBlocks();

    for (const pdf::PDFTextSelectionItem& item : items) {
        const pdf::PDFCharacterPointer& start = item.first;
        const pdf::PDFCharacterPointer& end = item.second;
        if (!start.isValid() || !end.isValid() || start.blockIndex != end.blockIndex || start.blockIndex >= blocks.size()) {
            continue;
        }

        const pdf::PDFTextBlock& block = blocks[start.blockIndex];
        const pdf::PDFTextLines& lines = block.getLines();
        if (start.lineIndex >= lines.size() || end.lineIndex >= lines.size() || end.lineIndex < start.lineIndex) {
            continue;
        }

        for (size_t lineIndex = start.lineIndex; lineIndex <= end.lineIndex; ++lineIndex) {
            const pdf::PDFTextLine& line = lines[lineIndex];
            const pdf::TextCharacters& characters = line.getCharacters();
            if (characters.empty()) continue;

            const size_t characterStart = lineIndex == start.lineIndex ? start.characterIndex : 0;
            const size_t characterEnd = lineIndex == end.lineIndex ? end.characterIndex : characters.size() - 1;
            if (characterStart > characterEnd || characterEnd >= characters.size()) continue;

            QRectF rect;
            bool hasRect = false;
            for (size_t characterIndex = characterStart; characterIndex <= characterEnd; ++characterIndex) {
                const QRectF characterRect = characters[characterIndex].boundingBox.controlPointRect();
                if (!characterRect.isValid()) continue;
                rect = hasRect ? rect.united(characterRect) : characterRect;
                hasRect = true;
            }

            if (hasRect && rect.isValid()) rects.push_back(rect);
        }
    }

    return rects;
}

pdf::PDFTextLayout textLayoutForPage(const pdf::PDFPage* page, pdf::PDFDocument& document, TextLayoutContext& context)
{
    pdf::PDFTextLayoutGenerator generator(
        pdf::PDFRenderer::IgnoreOptionalContent,
        page,
        &document,
        &context.fontCache,
        &context.cms,
        &context.optionalContentActivity,
        QTransform(),
        context.meshQualitySettings
    );
    generator.processContents();
    return generator.createTextLayout();
}

std::vector<TextMarkupHit> findTextMarkupHits(pdf::PDFDocument& document, const QString& query, bool caseSensitive)
{
    std::vector<TextMarkupHit> hits;
    const pdf::PDFCatalog* catalog = document.getCatalog();
    if (!catalog || query.trimmed().isEmpty()) return hits;

    TextLayoutContext textContext(document);
    const Qt::CaseSensitivity sensitivity = caseSensitive ? Qt::CaseSensitive : Qt::CaseInsensitive;
    const pdf::PDFInteger pageCount = static_cast<pdf::PDFInteger>(catalog->getPageCount());

    for (pdf::PDFInteger pageIndex = 0; pageIndex < pageCount; ++pageIndex) {
        const pdf::PDFPage* page = catalog->getPage(pageIndex);
        if (!page) continue;

        const pdf::PDFTextLayout textLayout = textLayoutForPage(page, document, textContext);
        const pdf::PDFTextFlows flows = pdf::PDFTextFlow::createTextFlows(
            textLayout,
            pdf::PDFTextFlow::FlowFlags(pdf::PDFTextFlow::SeparateBlocks) | pdf::PDFTextFlow::RemoveSoftHyphen,
            pageIndex
        );

        for (const pdf::PDFTextFlow& flow : flows) {
            const pdf::PDFFindResults results = flow.find(query, sensitivity);
            for (const pdf::PDFFindResult& found : results) {
                std::vector<QRectF> rects = selectionRectsForItems(textLayout, found.textSelectionItems);
                if (!rects.empty()) hits.push_back({ pageIndex, std::move(rects) });
            }
        }
    }

    return hits;
}

pdf::PDFObjectReference createTextMarkupAnnotation(
    pdf::PDFDocumentBuilder* builder,
    const QString& type,
    pdf::PDFObjectReference page,
    const QPolygonF& quadrilaterals,
    const QColor& color
)
{
    if (type == QStringLiteral("underline")) {
        return builder->createAnnotationUnderline(page, quadrilaterals, color);
    }

    if (type == QStringLiteral("strikeout")) {
        return builder->createAnnotationStrikeout(page, quadrilaterals, color);
    }

    return builder->createAnnotationHighlight(page, quadrilaterals, color);
}

std::vector<CreatedAnnotation> createWatermarkAnnotations(
    pdf::PDFDocumentBuilder* builder,
    const pdf::PDFCatalog* catalog,
    const QJsonObject& operation,
    QString* errorMessage
)
{
    const QString text = operation.value(QStringLiteral("text")).toString().trimmed();
    if (text.isEmpty()) {
        *errorMessage = QStringLiteral("Watermark annotation must include text.");
        return {};
    }

    const QString author = operation.value(QStringLiteral("author")).toString(QStringLiteral("Inkwell")).trimmed();
    const QString title = author.isEmpty() ? QStringLiteral("Inkwell") : author;
    const QColor textColor = operation.value(QStringLiteral("color")).isArray()
        ? readColor(operation)
        : QColor(80, 80, 80);

    std::vector<CreatedAnnotation> annotations;
    const size_t pageCount = catalog->getPageCount();
    annotations.reserve(pageCount);

    for (size_t pageIndex = 0; pageIndex < pageCount; ++pageIndex) {
        const pdf::PDFPage* pageObject = catalog->getPage(pageIndex);
        if (!pageObject) continue;

        const QRectF mediaBox = pageObject->getMediaBox();
        if (!mediaBox.isValid() || mediaBox.isEmpty()) continue;

        const double maxWidth = std::max(72.0, mediaBox.width() * 0.86);
        const double annotationWidth = std::clamp(mediaBox.width() * 0.68, 72.0, maxWidth);
        const double annotationHeight = std::clamp(mediaBox.height() * 0.08, 36.0, 96.0);
        const QRectF rect(
            QPointF(
                mediaBox.left() + (mediaBox.width() - annotationWidth) / 2.0,
                mediaBox.top() + (mediaBox.height() - annotationHeight) / 2.0
            ),
            QSizeF(annotationWidth, annotationHeight)
        );

        pdf::PDFFreeTextStyle style;
        style.fontSize = std::clamp(mediaBox.width() / 14.0, 20.0, 64.0);
        style.textColor = textColor;
        style.textAlignment = pdf::TextAlignment(Qt::AlignCenter);

        annotations.push_back(CreatedAnnotation{
            pageObject->getPageReference(),
            builder->createAnnotationFreeText(
                pageObject->getPageReference(),
                rect,
                title,
                QStringLiteral("Watermark"),
                text,
                style,
                false
            ),
        });
    }

    if (annotations.empty()) {
        *errorMessage = QStringLiteral("Watermark preview could not find any writable PDF pages.");
    }

    return annotations;
}

std::optional<std::vector<pdf::PDFInteger>> readOptionalPageIndices(
    const QJsonObject& operation,
    size_t pageCount,
    QString* errorMessage
)
{
    const QJsonValue value = operation.value(QStringLiteral("pageIndices"));
    if (value.isUndefined() || value.isNull()) return std::vector<pdf::PDFInteger>{};
    if (!value.isArray()) {
        *errorMessage = QStringLiteral("Redaction pageIndices must be an array of page indexes.");
        return std::nullopt;
    }

    std::vector<pdf::PDFInteger> pageIndices;
    for (const QJsonValue& item : value.toArray()) {
        if (!item.isDouble()) {
            *errorMessage = QStringLiteral("Redaction pageIndices must contain numeric page indexes.");
            return std::nullopt;
        }
        const int pageIndex = item.toInt(-1);
        if (pageIndex < 0 || static_cast<size_t>(pageIndex) >= pageCount) {
            *errorMessage = QStringLiteral("Redaction page index outside current document.");
            return std::nullopt;
        }
        const pdf::PDFInteger pdfPageIndex = static_cast<pdf::PDFInteger>(pageIndex);
        if (std::find(pageIndices.begin(), pageIndices.end(), pdfPageIndex) == pageIndices.end()) {
            pageIndices.push_back(pdfPageIndex);
        }
    }

    return pageIndices;
}

bool isPageAllowed(const std::vector<pdf::PDFInteger>& pageIndices, pdf::PDFInteger pageIndex)
{
    return pageIndices.empty() || std::find(pageIndices.begin(), pageIndices.end(), pageIndex) != pageIndices.end();
}

std::vector<CreatedAnnotation> createRedactionAnnotations(
    pdf::PDFDocumentBuilder* builder,
    pdf::PDFDocument& document,
    const pdf::PDFCatalog* catalog,
    const QJsonObject& operation,
    int* rectCount,
    QString* errorMessage
)
{
    const QString query = operation.value(QStringLiteral("query")).toString().trimmed();
    if (query.isEmpty()) {
        *errorMessage = QStringLiteral("Redaction annotation must include query.");
        return {};
    }

    const std::optional<std::vector<pdf::PDFInteger>> pageIndices = readOptionalPageIndices(
        operation,
        catalog->getPageCount(),
        errorMessage
    );
    if (!pageIndices) return {};

    const bool caseSensitive = operation.value(QStringLiteral("caseSensitive")).toBool(false);
    const QColor redactionColor = operation.value(QStringLiteral("color")).isArray()
        ? readColor(operation)
        : Qt::black;
    const std::vector<TextMarkupHit> hits = findTextMarkupHits(document, query, caseSensitive);

    std::vector<CreatedAnnotation> annotations;
    for (const TextMarkupHit& hit : hits) {
        if (!isPageAllowed(*pageIndices, hit.pageIndex)) continue;

        const pdf::PDFPage* pageObject = catalog->getPage(hit.pageIndex);
        if (!pageObject) continue;

        QPolygonF quadrilaterals;
        for (const QRectF& rect : hit.rects) {
            appendHighlightQuadrilateral(quadrilaterals, rect);
            ++(*rectCount);
        }
        if (quadrilaterals.isEmpty()) continue;

        const pdf::PDFObjectReference page = pageObject->getPageReference();
        annotations.push_back(CreatedAnnotation{
            page,
            builder->createAnnotationRedact(page, quadrilaterals, redactionColor),
        });
    }

    if (annotations.empty()) {
        *errorMessage = QStringLiteral("Redaction query did not match current document.");
    }

    return annotations;
}

bool applyPageRotations(
    pdf::PDFDocumentBuilder* builder,
    const pdf::PDFCatalog* catalog,
    const QJsonObject& operation,
    std::vector<PageRotationChange>* pageRotations,
    int* operationCount,
    QString* errorMessage
)
{
    const QJsonValue rotationsValue = operation.value(QStringLiteral("rotations"));
    if (!rotationsValue.isObject()) {
        *errorMessage = QStringLiteral("Page rotation operation must include rotations object.");
        return false;
    }

    const QJsonObject rotations = rotationsValue.toObject();
    if (rotations.isEmpty()) {
        *errorMessage = QStringLiteral("Page rotation operation must include at least one page.");
        return false;
    }

    const size_t pageCount = catalog->getPageCount();
    for (auto it = rotations.constBegin(); it != rotations.constEnd(); ++it) {
        bool ok = false;
        const int pageIndex = it.key().toInt(&ok);
        if (!ok || pageIndex < 0 || static_cast<size_t>(pageIndex) >= pageCount) {
            *errorMessage = QStringLiteral("Page rotation operation page outside current document.");
            return false;
        }
        if (!it.value().isDouble()) {
            *errorMessage = QStringLiteral("Page rotation value must be numeric degrees.");
            return false;
        }

        const std::optional<pdf::PageRotation> rotation = pageRotationFromDegrees(it.value().toInt());
        if (!rotation) {
            *errorMessage = QStringLiteral("Page rotation must be 0, 90, 180, or 270 degrees.");
            return false;
        }

        const pdf::PDFPage* pageObject = catalog->getPage(static_cast<size_t>(pageIndex));
        if (!pageObject) {
            *errorMessage = QStringLiteral("Page rotation operation page unavailable.");
            return false;
        }

        const pdf::PDFObjectReference page = pageObject->getPageReference();
        pageRotations->push_back(PageRotationChange{
            page,
            pageRotationDegrees(pageObject->getPageRotation()),
        });
        builder->setPageRotation(page, *rotation);
        ++(*operationCount);
    }

    return true;
}

bool setImageStampAppearance(
    pdf::PDFDocumentBuilder* builder,
    pdf::PDFObjectReference annotation,
    const QRectF& annotationRect,
    const QString& imagePath,
    QString* errorMessage
)
{
    const QImage image(imagePath);
    if (image.isNull()) {
        *errorMessage = QStringLiteral("Image stamp annotation must reference a readable image file.");
        return false;
    }

    pdf::PDFContentStreamBuilder contentBuilder(annotationRect.size(), pdf::PDFContentStreamBuilder::CoordinateSystem::Qt);
    QPainter* painter = contentBuilder.begin();
    if (!painter) {
        *errorMessage = QStringLiteral("PDF4QT could not create image stamp appearance stream.");
        return false;
    }

    QSizeF imageSize(image.size());
    imageSize.scale(annotationRect.size(), Qt::KeepAspectRatio);
    const QRectF imageRect(
        QPointF(
            (annotationRect.width() - imageSize.width()) / 2.0,
            (annotationRect.height() - imageSize.height()) / 2.0
        ),
        imageSize
    );
    painter->setRenderHint(QPainter::SmoothPixmapTransform, true);
    painter->drawImage(imageRect, image);

    const pdf::PDFContentStreamBuilder::ContentStream contentStream = contentBuilder.end(painter);
    if (!contentStream.pageObject.isValid()) {
        *errorMessage = QStringLiteral("PDF4QT produced invalid image stamp appearance stream.");
        return false;
    }

    std::vector<pdf::PDFObject> copiedObjects = builder->copyFrom(
        { contentStream.resources, contentStream.contents },
        contentStream.document.getStorage(),
        true
    );
    if (copiedObjects.size() != 2 || !copiedObjects[0].isReference() || !copiedObjects[1].isReference()) {
        *errorMessage = QStringLiteral("PDF4QT could not copy image stamp appearance resources.");
        return false;
    }

    const pdf::PDFObjectReference resourcesReference = copiedObjects[0].getReference();
    const pdf::PDFObjectReference formReference = copiedObjects[1].getReference();
    const QRectF appearanceBox(QPointF(0.0, 0.0), annotationRect.size());

    pdf::PDFObjectFactory formFactory;
    formFactory.beginDictionary();
    formFactory.beginDictionaryItem("Type");
    formFactory << pdf::WrapName("XObject");
    formFactory.endDictionaryItem();
    formFactory.beginDictionaryItem("Subtype");
    formFactory << pdf::WrapName("Form");
    formFactory.endDictionaryItem();
    formFactory.beginDictionaryItem("BBox");
    formFactory << appearanceBox;
    formFactory.endDictionaryItem();
    formFactory.beginDictionaryItem("Resources");
    formFactory << resourcesReference;
    formFactory.endDictionaryItem();
    formFactory.endDictionary();
    builder->mergeTo(formReference, formFactory.takeObject());

    pdf::PDFObjectFactory annotationFactory;
    annotationFactory.beginDictionary();
    annotationFactory.beginDictionaryItem("Rect");
    annotationFactory << annotationRect;
    annotationFactory.endDictionaryItem();
    annotationFactory.beginDictionaryItem("AP");
    annotationFactory.beginDictionary();
    annotationFactory.beginDictionaryItem("N");
    annotationFactory << formReference;
    annotationFactory.endDictionaryItem();
    annotationFactory.endDictionary();
    annotationFactory.endDictionaryItem();
    annotationFactory.endDictionary();
    builder->mergeTo(annotation, annotationFactory.takeObject());

    return true;
}

std::optional<CreatedAnnotation> createStandardAnnotation(
    pdf::PDFDocumentBuilder* builder,
    const pdf::PDFCatalog* catalog,
    const QJsonObject& operation,
    QString* errorMessage
)
{
    const QString type = operation.value(QStringLiteral("type")).toString();
    const int pageIndex = operation.value(QStringLiteral("page")).toInt(-1);
    if (pageIndex < 0 || static_cast<size_t>(pageIndex) >= catalog->getPageCount()) {
        *errorMessage = QStringLiteral("Annotation operation page outside current document.");
        return std::nullopt;
    }

    const pdf::PDFPage* pageObject = catalog->getPage(static_cast<size_t>(pageIndex));
    if (!pageObject) {
        *errorMessage = QStringLiteral("Annotation operation page is unavailable.");
        return std::nullopt;
    }

    const pdf::PDFObjectReference page = pageObject->getPageReference();
    const QString author = operation.value(QStringLiteral("author")).toString(QStringLiteral("Inkwell")).trimmed();
    const QString title = author.isEmpty() ? QStringLiteral("Inkwell") : author;

    if (type == QStringLiteral("comment")) {
        const QString text = operation.value(QStringLiteral("text")).toString().trimmed();
        if (text.isEmpty()) {
            *errorMessage = QStringLiteral("Comment annotation must include text.");
            return std::nullopt;
        }
        const std::optional<QRectF> rect = readPositionRectangle(operation, 24.0, 24.0);
        if (!rect) {
            *errorMessage = QStringLiteral("Comment annotation must include numeric x and y values.");
            return std::nullopt;
        }
        return CreatedAnnotation{
            page,
            builder->createAnnotationText(
                page,
                *rect,
                pdf::TextAnnotationIcon::Comment,
                title,
                QStringLiteral("Comment"),
                text,
                false
            ),
        };
    }

    if (type == QStringLiteral("freeText")) {
        const QString text = operation.value(QStringLiteral("text")).toString().trimmed();
        if (text.isEmpty()) {
            *errorMessage = QStringLiteral("Free text annotation must include text.");
            return std::nullopt;
        }
        const std::optional<QRectF> rect = readPositionRectangle(operation, 180.0, 48.0);
        if (!rect) {
            *errorMessage = QStringLiteral("Free text annotation must include numeric x and y values.");
            return std::nullopt;
        }
        return CreatedAnnotation{
            page,
            builder->createAnnotationFreeText(
                page,
                *rect,
                title,
                QStringLiteral("Free text"),
                text,
                pdf::TextAlignment(Qt::AlignLeft | Qt::AlignTop)
            ),
        };
    }

    if (type == QStringLiteral("stamp")) {
        const QString stamp = operation.value(QStringLiteral("stamp")).toString(QStringLiteral("Approved"));
        const std::optional<QRectF> rect = readPositionRectangle(operation, 120.0, 48.0);
        if (!rect) {
            *errorMessage = QStringLiteral("Stamp annotation must include numeric x and y values.");
            return std::nullopt;
        }
        return CreatedAnnotation{
            page,
            builder->createAnnotationStamp(page, *rect, readStampType(stamp), title, QStringLiteral("Stamp"), stamp),
        };
    }

    if (type == QStringLiteral("imageStamp")) {
        const QString imagePath = operation.value(QStringLiteral("imagePath")).toString().trimmed();
        if (imagePath.isEmpty()) {
            *errorMessage = QStringLiteral("Image stamp annotation must include imagePath.");
            return std::nullopt;
        }
        const std::optional<QRectF> rect = readPositionRectangle(operation, 180.0, 60.0);
        if (!rect) {
            *errorMessage = QStringLiteral("Image stamp annotation must include numeric x, y, width, height values.");
            return std::nullopt;
        }
        const pdf::PDFObjectReference annotation = builder->createAnnotationStamp(
            page,
            *rect,
            pdf::Stamp::Approved,
            title,
            QStringLiteral("Image signature"),
            imagePath
        );
        if (!setImageStampAppearance(builder, annotation, *rect, imagePath, errorMessage)) {
            return std::nullopt;
        }
        return CreatedAnnotation{ page, annotation, false };
    }

    if (type == QStringLiteral("shape")) {
        const QString kind = operation.value(QStringLiteral("kind")).toString(QStringLiteral("rectangle"));
        const std::optional<QRectF> rect = readPositionRectangle(operation, 120.0, 80.0);
        if (!rect) {
            *errorMessage = QStringLiteral("Shape annotation must include numeric x, y, width, and height values.");
            return std::nullopt;
        }
        const pdf::PDFReal strokeWidth = readNumber(operation, QStringLiteral("strokeWidth")).value_or(2.0);
        const QColor fillColor;
        const QColor strokeColor = readColor(operation);
        if (kind == QStringLiteral("ellipse")) {
            return CreatedAnnotation{
                page,
                builder->createAnnotationCircle(page, *rect, strokeWidth, fillColor, strokeColor, title, QStringLiteral("Shape"), kind),
            };
        }
        if (kind == QStringLiteral("line")) {
            return CreatedAnnotation{
                page,
                builder->createAnnotationLine(
                    page,
                    *rect,
                    rect->topLeft(),
                    rect->bottomRight(),
                    strokeWidth,
                    fillColor,
                    strokeColor,
                    title,
                    QStringLiteral("Shape"),
                    kind,
                    pdf::AnnotationLineEnding::None,
                    pdf::AnnotationLineEnding::None
                ),
            };
        }
        return CreatedAnnotation{
            page,
            builder->createAnnotationSquare(page, *rect, strokeWidth, fillColor, strokeColor, title, QStringLiteral("Shape"), kind),
        };
    }

    *errorMessage = QStringLiteral("Unsupported annotation operation.");
    return std::nullopt;
}

QString siblingOutputPath(const QString& sourcePath, const QString& suffix)
{
    const QFileInfo sourceInfo(sourcePath);
    const QDir directory = sourceInfo.absoluteDir();
    const QString baseName = sourceInfo.completeBaseName().isEmpty()
        ? QStringLiteral("document")
        : sourceInfo.completeBaseName();

    QString candidate = directory.filePath(QStringLiteral("%1_%2.pdf").arg(baseName, suffix));
    for (int index = 2; QFileInfo::exists(candidate); ++index) {
        candidate = directory.filePath(QStringLiteral("%1_%2_%3.pdf").arg(baseName, suffix).arg(index));
    }

    return QFileInfo(candidate).absoluteFilePath();
}

QString siblingAppliedPath(const QString& sourcePath)
{
    return siblingOutputPath(sourcePath, QStringLiteral("applied"));
}

QString siblingRedactedPath(const QString& sourcePath)
{
    return siblingOutputPath(sourcePath, QStringLiteral("redacted"));
}

QJsonObject availabilityJson(bool ok, pdfviewer::PDFUndoRedoManager* undoManager)
{
    return QJsonObject{
        { QStringLiteral("ok"), ok },
        { QStringLiteral("undoAvailable"), undoManager ? undoManager->canUndo() : false },
        { QStringLiteral("redoAvailable"), undoManager ? undoManager->canRedo() : false },
    };
}

QJsonObject unavailableJson(const QString& message, pdfviewer::PDFUndoRedoManager* undoManager = nullptr)
{
    QJsonObject response = availabilityJson(false, undoManager);
    response.insert(QStringLiteral("code"), QStringLiteral("unavailable"));
    response.insert(QStringLiteral("message"), message);
    return response;
}

}

InkwellPdfBridge::InkwellPdfBridge(QObject* parent)
    : QObject(parent)
{
}

void InkwellPdfBridge::setProgramController(pdfviewer::PDFProgramController* controller)
{
    if (programController == controller) return;

    programController = controller;
    activePreviewBatches.clear();
    Q_EMIT currentDocumentChanged();
}

void InkwellPdfBridge::setCurrentPath(const QString& path)
{
    const QString normalizedPath = path.trimmed().isEmpty()
        ? QString()
        : QFileInfo(path).absoluteFilePath();
    if (currentPath == normalizedPath) return;

    currentPath = normalizedPath;
    activePreviewBatches.clear();
    Q_EMIT currentDocumentChanged();
}

QString InkwellPdfBridge::currentDocumentJson() const
{
    return getCurrentDocumentJson();
}

QString InkwellPdfBridge::getCurrentDocumentJson() const
{
    const pdf::PDFDocument* document = programController ? programController->getDocument() : nullptr;
    if (!document) {
        return compactJson({ { QStringLiteral("document"), QJsonValue::Null } });
    }

    const QFileInfo fileInfo(currentPath);
    const qint64 pageCount = static_cast<qint64>(document->getCatalog()->getPageCount());
    const QString title = fileInfo.fileName().isEmpty() ? QStringLiteral("Untitled PDF") : fileInfo.fileName();

    return compactJson({
        {
            QStringLiteral("document"),
            QJsonObject{
                { QStringLiteral("id"), currentPath },
                { QStringLiteral("path"), currentPath },
                { QStringLiteral("title"), title },
                { QStringLiteral("pageCount"), pageCount },
            },
        },
    });
}

QString InkwellPdfBridge::previewOperationsJson(const QString& batchJson)
{
    QJsonParseError parseError;
    const QJsonDocument parsedBatch = QJsonDocument::fromJson(batchJson.toUtf8(), &parseError);
    if (parseError.error != QJsonParseError::NoError || !parsedBatch.isObject()) {
        return parseErrorJson(QStringLiteral("Operation batch must be JSON object."));
    }

    const QJsonObject batch = parsedBatch.object();
    if (!batch.value(QStringLiteral("operations")).isArray()) {
        return parseErrorJson(QStringLiteral("Operation batch must include operations array."));
    }

    const QJsonArray operations = batch.value(QStringLiteral("operations")).toArray();
    if (operations.isEmpty()) {
        return parseErrorJson(QStringLiteral("Operation batch must contain at least one operation."));
    }

    pdf::PDFDocument* sourceDocument = programController ? programController->getDocument() : nullptr;
    if (!sourceDocument) {
        return parseErrorJson(QStringLiteral("No PDF4QT document is open."));
    }
    const pdf::PDFCatalog* catalog = sourceDocument->getCatalog();
    if (!catalog) {
        return parseErrorJson(QStringLiteral("PDF4QT document has no catalog."));
    }

    pdf::PDFDocumentModifier modifier(sourceDocument);
    PreviewBatch previewBatch;
    previewBatch.batchId = batch.value(QStringLiteral("batchId")).toString(QStringLiteral("native-preview"));

    for (const QJsonValue& operationValue : operations) {
        if (!operationValue.isObject()) {
            return parseErrorJson(QStringLiteral("Every operation must be JSON object."));
        }

        const QJsonObject operation = operationValue.toObject();
        const QString type = operation.value(QStringLiteral("type")).toString();
        if (type == QStringLiteral("rotatePages")) {
            QString errorMessage;
            std::vector<PageRotationChange> pageRotations;
            int rotationOperationCount = 0;
            if (!applyPageRotations(
                    modifier.getBuilder(),
                    catalog,
                    operation,
                    &pageRotations,
                    &rotationOperationCount,
                    &errorMessage
                )) {
                return parseErrorJson(errorMessage);
            }

            for (const PageRotationChange& rotation : pageRotations) {
                previewBatch.pageRotations.push_back(PreviewPageRotationRef{
                    rotation.page,
                    rotation.originalRotation,
                });
            }
            previewBatch.operationCount += rotationOperationCount;
            continue;
        }

        if (type == QStringLiteral("watermark")) {
            QString errorMessage;
            const std::vector<CreatedAnnotation> annotations = createWatermarkAnnotations(
                modifier.getBuilder(),
                catalog,
                operation,
                &errorMessage
            );
            if (annotations.empty()) {
                return parseErrorJson(errorMessage);
            }

            for (const CreatedAnnotation& created : annotations) {
                modifier.getBuilder()->setAnnotationOpacity(created.annotation, readOpacity(operation));
                if (created.refreshAppearance) {
                    modifier.getBuilder()->updateAnnotationAppearanceStreams(created.annotation);
                }
                previewBatch.annotations.push_back(PreviewAnnotationRef{ created.page, created.annotation });
                ++previewBatch.operationCount;
            }
            continue;
        }

        if (type == QStringLiteral("redact")) {
            QString errorMessage;
            int redactionRectCount = 0;
            const std::vector<CreatedAnnotation> annotations = createRedactionAnnotations(
                modifier.getBuilder(),
                *sourceDocument,
                catalog,
                operation,
                &redactionRectCount,
                &errorMessage
            );
            if (annotations.empty()) {
                return parseErrorJson(errorMessage);
            }

            for (const CreatedAnnotation& created : annotations) {
                if (created.refreshAppearance) {
                    modifier.getBuilder()->updateAnnotationAppearanceStreams(created.annotation);
                }
                previewBatch.annotations.push_back(PreviewAnnotationRef{ created.page, created.annotation });
                ++previewBatch.operationCount;
            }
            previewBatch.rectCount += redactionRectCount;
            previewBatch.requiresRedaction = true;
            continue;
        }

        if (isSupportedAnnotationOperationType(type)) {
            QString errorMessage;
            const std::optional<CreatedAnnotation> created = createStandardAnnotation(
                modifier.getBuilder(),
                catalog,
                operation,
                &errorMessage
            );
            if (!created) {
                return parseErrorJson(errorMessage);
            }
            if (created->refreshAppearance) {
                modifier.getBuilder()->updateAnnotationAppearanceStreams(created->annotation);
            }
            previewBatch.annotations.push_back(PreviewAnnotationRef{ created->page, created->annotation });
            ++previewBatch.operationCount;
            continue;
        }

        if (!isSupportedTextMarkupType(type)) {
            return unsupportedMutationJson(QStringLiteral("previewOperations"));
        }

        const QString query = operation.value(QStringLiteral("query")).toString().trimmed();
        if (!query.isEmpty()) {
            const bool caseSensitive = operation.value(QStringLiteral("caseSensitive")).toBool(false);
            const std::vector<TextMarkupHit> hits = findTextMarkupHits(*sourceDocument, query, caseSensitive);
            if (hits.empty()) {
                return parseErrorJson(QStringLiteral("Text markup query did not match current document."));
            }

            for (const TextMarkupHit& hit : hits) {
                const pdf::PDFPage* pageObject = catalog->getPage(hit.pageIndex);
                if (!pageObject) continue;

                QPolygonF quadrilaterals;
                for (const QRectF& rect : hit.rects) {
                    appendHighlightQuadrilateral(quadrilaterals, rect);
                    ++previewBatch.rectCount;
                }
                if (quadrilaterals.isEmpty()) continue;

                const pdf::PDFObjectReference page = pageObject->getPageReference();
                const pdf::PDFObjectReference annotation = createTextMarkupAnnotation(
                    modifier.getBuilder(),
                    type,
                    page,
                    quadrilaterals,
                    readColor(operation)
                );
                modifier.getBuilder()->setAnnotationOpacity(annotation, readOpacity(operation));
                modifier.getBuilder()->updateAnnotationAppearanceStreams(annotation);
                previewBatch.annotations.push_back(PreviewAnnotationRef{ page, annotation });
                ++previewBatch.operationCount;
            }
            continue;
        }

        const int pageIndex = operation.value(QStringLiteral("page")).toInt(-1);
        const size_t pageCount = catalog->getPageCount();
        if (pageIndex < 0 || static_cast<size_t>(pageIndex) >= pageCount) {
            return parseErrorJson(QStringLiteral("Text markup operation page outside current document."));
        }

        const QJsonValue rectsValue = operation.value(QStringLiteral("rects"));
        if (!rectsValue.isArray()) {
            return parseErrorJson(QStringLiteral("Text markup operation must include rects array."));
        }

        const QJsonArray rects = rectsValue.toArray();
        if (rects.isEmpty()) {
            return parseErrorJson(QStringLiteral("Text markup operation must contain at least one rect."));
        }

        QPolygonF quadrilaterals;
        for (const QJsonValue& rectValue : rects) {
            const std::optional<QRectF> rect = readRect(rectValue);
            if (!rect) {
                return parseErrorJson(QStringLiteral("Text markup rect must include numeric x0, y0, x1, y1 values."));
            }

            appendHighlightQuadrilateral(quadrilaterals, *rect);
            ++previewBatch.rectCount;
        }

        const pdf::PDFObjectReference page =
            catalog->getPage(static_cast<size_t>(pageIndex))->getPageReference();
        const pdf::PDFObjectReference annotation = createTextMarkupAnnotation(
            modifier.getBuilder(),
            type,
            page,
            quadrilaterals,
            readColor(operation)
        );
        modifier.getBuilder()->setAnnotationOpacity(annotation, readOpacity(operation));
        modifier.getBuilder()->updateAnnotationAppearanceStreams(annotation);
        previewBatch.annotations.push_back(PreviewAnnotationRef{ page, annotation });
        ++previewBatch.operationCount;
    }

    if (previewBatch.operationCount == 0) {
        return parseErrorJson(QStringLiteral("Text markup preview did not produce annotations."));
    }

    if (!previewBatch.pageRotations.empty()) {
        modifier.markReset();
    } else {
        modifier.markAnnotationsChanged();
    }
    if (!modifier.finalize()) {
        return parseErrorJson(QStringLiteral("PDF4QT did not produce modified document for requested preview."));
    }

    pdf::PDFModifiedDocument modifiedDocument(modifier.getDocument(), nullptr, modifier.getFlags());
    programController->onDocumentModified(std::move(modifiedDocument));

    activePreviewBatches.erase(
        std::remove_if(
            activePreviewBatches.begin(),
            activePreviewBatches.end(),
            [&previewBatch](const PreviewBatch& activeBatch) {
                return activeBatch.batchId == previewBatch.batchId;
            }
        ),
        activePreviewBatches.end()
    );
    activePreviewBatches.push_back(std::move(previewBatch));

    const PreviewBatch& activeBatch = activePreviewBatches.back();
    QJsonObject response = availabilityJson(true, undoRedoManager());
    response.insert(QStringLiteral("batchId"), activeBatch.batchId);
    response.insert(QStringLiteral("operationCount"), activeBatch.operationCount);
    response.insert(QStringLiteral("rectCount"), activeBatch.rectCount);
    return compactJson(response);
}

QString InkwellPdfBridge::applyOperationsJson(const QString& batchId)
{
    pdf::PDFDocument* document = programController ? programController->getDocument() : nullptr;
    if (!document) {
        return parseErrorJson(QStringLiteral("No PDF4QT document is open."));
    }

    const QString requestedBatchId = batchId.trimmed();
    const PreviewBatch* targetBatch = nullptr;
    for (const PreviewBatch& activeBatch : activePreviewBatches) {
        if ((!requestedBatchId.isEmpty() && activeBatch.batchId == requestedBatchId)
            || (requestedBatchId.isEmpty() && activeBatch.requiresRedaction)) {
            targetBatch = &activeBatch;
            break;
        }
    }
    const bool requiresRedaction = targetBatch && targetBatch->requiresRedaction;

    QString sourcePath = currentPath;
    if (sourcePath.isEmpty() && programController) {
        sourcePath = programController->getOriginalFileName();
    }
    if (sourcePath.isEmpty()) {
        return parseErrorJson(QStringLiteral("Current PDF path is unavailable."));
    }

    const QString outputPath = requiresRedaction ? siblingRedactedPath(sourcePath) : siblingAppliedPath(sourcePath);
    if (QFileInfo(outputPath).absoluteFilePath() == QFileInfo(sourcePath).absoluteFilePath()) {
        return parseErrorJson(QStringLiteral("Refusing to write PDF output over source file."));
    }

    pdf::PDFDocumentWriter writer(nullptr);
    const pdf::PDFOperationResult result = [&]() {
        if (!requiresRedaction) {
            return writer.write(outputPath, document, true);
        }

        TextLayoutContext redactContext(*document);
        pdf::PDFRedact redactProcessor(
            document,
            &redactContext.fontCache,
            &redactContext.cms,
            &redactContext.optionalContentActivity,
            &redactContext.meshQualitySettings,
            Qt::black
        );
        pdf::PDFRedact::Options options;
        options.setFlag(pdf::PDFRedact::CopyTitle, true);
        options.setFlag(pdf::PDFRedact::CopyMetadata, true);
        options.setFlag(pdf::PDFRedact::CopyOutline, true);
        pdf::PDFDocument redactedDocument = redactProcessor.perform(pdf::PDFRedact::Options(options));
        return writer.write(outputPath, &redactedDocument, false);
    }();

    if (!result) {
        return compactJson({
            { QStringLiteral("ok"), false },
            { QStringLiteral("code"), QStringLiteral("write_failed") },
            { QStringLiteral("message"), result.getErrorMessage() },
        });
    }

    activePreviewBatches.clear();

    QJsonObject response = availabilityJson(true, undoRedoManager());
    response.insert(QStringLiteral("batchId"), batchId);
    response.insert(QStringLiteral("outputPath"), outputPath);
    return compactJson(response);
}

QString InkwellPdfBridge::undoJson()
{
    pdfviewer::PDFUndoRedoManager* undoManager = undoRedoManager();
    if (!undoManager) {
        return compactJson(unavailableJson(QStringLiteral("PDF4QT undo stack is not available.")));
    }

    if (!undoManager->canUndo()) {
        return compactJson(unavailableJson(QStringLiteral("Nothing to undo."), undoManager));
    }

    undoManager->doUndo();
    return compactJson(availabilityJson(true, undoManager));
}

QString InkwellPdfBridge::redoJson()
{
    pdfviewer::PDFUndoRedoManager* undoManager = undoRedoManager();
    if (!undoManager) {
        return compactJson(unavailableJson(QStringLiteral("PDF4QT undo stack is not available.")));
    }

    if (!undoManager->canRedo()) {
        return compactJson(unavailableJson(QStringLiteral("Nothing to redo."), undoManager));
    }

    undoManager->doRedo();
    return compactJson(availabilityJson(true, undoManager));
}

QString InkwellPdfBridge::clearPreviewJson(const QString& batchId)
{
    pdf::PDFDocument* sourceDocument = programController ? programController->getDocument() : nullptr;
    if (!sourceDocument) {
        return parseErrorJson(QStringLiteral("No PDF4QT document is open."));
    }

    const bool clearAll = batchId.trimmed().isEmpty();
    std::vector<PreviewBatch> batchesToClear;
    for (const PreviewBatch& activeBatch : activePreviewBatches) {
        if (clearAll || activeBatch.batchId == batchId) {
            batchesToClear.push_back(activeBatch);
        }
    }

    if (batchesToClear.empty()) {
        return compactJson(unavailableJson(QStringLiteral("No matching preview batch is active."), undoRedoManager()));
    }

    pdf::PDFDocumentModifier modifier(sourceDocument);
    int operationCount = 0;
    int rectCount = 0;
    bool resetPages = false;
    for (const PreviewBatch& previewBatch : batchesToClear) {
        operationCount += previewBatch.operationCount;
        rectCount += previewBatch.rectCount;
        for (const PreviewAnnotationRef& annotation : previewBatch.annotations) {
            modifier.getBuilder()->removeAnnotation(annotation.page, annotation.annotation);
        }
        for (const PreviewPageRotationRef& rotation : previewBatch.pageRotations) {
            const std::optional<pdf::PageRotation> originalRotation = pageRotationFromDegrees(rotation.originalRotation);
            if (originalRotation) {
                modifier.getBuilder()->setPageRotation(rotation.page, *originalRotation);
                resetPages = true;
            }
        }
    }

    if (resetPages) {
        modifier.markReset();
    } else {
        modifier.markAnnotationsChanged();
    }
    if (modifier.finalize()) {
        pdf::PDFModifiedDocument modifiedDocument(modifier.getDocument(), nullptr, modifier.getFlags());
        programController->onDocumentModified(std::move(modifiedDocument));
    }

    activePreviewBatches.erase(
        std::remove_if(
            activePreviewBatches.begin(),
            activePreviewBatches.end(),
            [clearAll, &batchId](const PreviewBatch& activeBatch) {
                return clearAll || activeBatch.batchId == batchId;
            }
        ),
        activePreviewBatches.end()
    );

    QJsonObject response = availabilityJson(true, undoRedoManager());
    response.insert(QStringLiteral("batchId"), batchId);
    response.insert(QStringLiteral("operationCount"), operationCount);
    response.insert(QStringLiteral("rectCount"), rectCount);
    return compactJson(response);
}

pdfviewer::PDFUndoRedoManager* InkwellPdfBridge::undoRedoManager() const
{
    return programController ? programController->findChild<pdfviewer::PDFUndoRedoManager*>() : nullptr;
}

QString InkwellPdfBridge::unsupportedMutationJson(const QString& method) const
{
    return compactJson({
        { QStringLiteral("ok"), false },
        { QStringLiteral("method"), method },
        { QStringLiteral("code"), QStringLiteral("unsupported") },
        {
            QStringLiteral("message"),
            QStringLiteral("PdfOperationBridge connected PDF4QT, but operation is not implemented yet."),
        },
    });
}

QString InkwellPdfBridge::parseErrorJson(const QString& message) const
{
    return compactJson({
        { QStringLiteral("ok"), false },
        { QStringLiteral("code"), QStringLiteral("invalid_request") },
        { QStringLiteral("message"), message },
    });
}

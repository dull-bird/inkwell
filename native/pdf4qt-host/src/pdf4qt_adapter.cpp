#include "pdf4qt_adapter.h"

#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QTransform>

#ifdef INKWELL_ENABLE_PDF4QT_ADAPTER
#include "pdfcms.h"
#include "pdfconstants.h"
#include "pdfcatalog.h"
#include "pdfdocument.h"
#include "pdfdocumentreader.h"
#include "pdffont.h"
#include "pdfmeshqualitysettings.h"
#include "pdfoptionalcontent.h"
#include "pdfpage.h"
#include "pdfrenderer.h"
#include "pdftextlayout.h"
#include "pdftextlayoutgenerator.h"

#include <algorithm>
#include <optional>
#include <set>
#include <vector>
#endif

namespace {

Pdf4qtAdapterResponse makeResult(const QJsonObject& result) {
    Pdf4qtAdapterResponse response;
    response.ok = true;
    response.result = result;
    return response;
}

Pdf4qtAdapterResponse makeError(int code, const QString& message) {
    Pdf4qtAdapterResponse response;
    response.ok = false;
    response.errorCode = code;
    response.errorMessage = message;
    return response;
}

QString pdf4qtSourceDir() {
#ifdef INKWELL_PDF4QT_SOURCE_DIR
    return QString::fromUtf8(INKWELL_PDF4QT_SOURCE_DIR);
#else
    return QStringLiteral("native/vendor/pdf4qt");
#endif
}

#ifdef INKWELL_ENABLE_PDF4QT_ADAPTER

struct ReadDocumentResult {
    bool ok = false;
    pdf::PDFDocument document;
    QStringList warnings;
    int errorCode = -32000;
    QString errorMessage;
};

struct TextLayoutContext {
    pdf::PDFFontCache fontCache;
    pdf::PDFCMSGeneric cms;
    pdf::PDFMeshQualitySettings meshQualitySettings;
    pdf::PDFOptionalContentActivity optionalContentActivity;
    pdf::PDFModifiedDocument modifiedDocument;

    explicit TextLayoutContext(pdf::PDFDocument& document) :
        fontCache(pdf::DEFAULT_FONT_CACHE_LIMIT, pdf::DEFAULT_REALIZED_FONT_CACHE_LIMIT),
        optionalContentActivity(&document, pdf::OCUsage::Export, nullptr),
        modifiedDocument(&document, &optionalContentActivity)
    {
        fontCache.setDocument(modifiedDocument);
        fontCache.setCacheShrinkEnabled(nullptr, false);
    }
};

struct PageIndicesResult {
    bool ok = false;
    std::vector<pdf::PDFInteger> indices;
    int errorCode = -32602;
    QString errorMessage;
};

QJsonArray warningsToJson(const QStringList& warnings) {
    QJsonArray items;
    for (const QString& warning : warnings) {
        items.append(warning);
    }
    return items;
}

QJsonObject documentToInfo(const QString& path, const pdf::PDFDocument& document, const QStringList& warnings) {
    const pdf::PDFCatalog* catalog = document.getCatalog();
    QJsonArray pageSizes;

    if (catalog) {
        for (size_t index = 0; index < catalog->getPageCount(); ++index) {
            const pdf::PDFPage* page = catalog->getPage(index);
            const QRectF mediaBox = page->getMediaBox();
            QJsonObject size;
            size.insert("page", static_cast<int>(index + 1));
            size.insert("width", mediaBox.width());
            size.insert("height", mediaBox.height());
            pageSizes.append(size);
        }
    }

    QJsonObject result;
    result.insert("path", path);
    result.insert("page_count", catalog ? static_cast<int>(catalog->getPageCount()) : 0);
    result.insert("version", QString::fromUtf8(document.getVersion()));
    result.insert("page_sizes", pageSizes);
    result.insert("warnings", warningsToJson(warnings));
    result.insert("engine", "PDF4QT");
    return result;
}

ReadDocumentResult readDocument(const QString& path) {
    ReadDocumentResult result;
    if (path.trimmed().isEmpty()) {
        result.errorCode = -32602;
        result.errorMessage = "Missing PDF path.";
        return result;
    }

    QFileInfo file(path);
    if (!file.exists() || !file.isFile()) {
        result.errorCode = -32602;
        result.errorMessage = QString("PDF does not exist: %1").arg(path);
        return result;
    }

    pdf::PDFDocumentReader reader(
        nullptr,
        [](bool* ok) {
            if (ok) {
                *ok = false;
            }
            return QString();
        },
        true,
        false
    );
    result.document = reader.readFromFile(path);
    if (reader.getReadingResult() != pdf::PDFDocumentReader::Result::OK) {
        result.errorCode = -32010;
        result.errorMessage = QString("PDF4QT failed to read document: %1").arg(reader.getErrorMessage());
        return result;
    }

    result.ok = true;
    result.warnings = reader.getWarnings();
    return result;
}

Pdf4qtAdapterResponse readDocumentInfo(const QString& path) {
    ReadDocumentResult read = readDocument(path);
    if (!read.ok) {
        return makeError(read.errorCode, read.errorMessage);
    }

    return makeResult(documentToInfo(path, read.document, read.warnings));
}

QJsonObject rectToJson(const QRectF& rect) {
    QJsonObject item;
    item.insert("x0", rect.left());
    item.insert("y0", rect.top());
    item.insert("x1", rect.right());
    item.insert("y1", rect.bottom());
    return item;
}

QJsonArray selectionRectsToJson(const pdf::PDFTextLayout& layout, const pdf::PDFTextSelectionItems& items) {
    QJsonArray rects;
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
            if (characters.empty()) {
                continue;
            }

            size_t characterStart = lineIndex == start.lineIndex ? start.characterIndex : 0;
            size_t characterEnd = lineIndex == end.lineIndex ? end.characterIndex : characters.size() - 1;
            if (characterStart > characterEnd || characterEnd >= characters.size()) {
                continue;
            }

            QRectF rect;
            bool hasRect = false;
            for (size_t characterIndex = characterStart; characterIndex <= characterEnd; ++characterIndex) {
                const QRectF characterRect = characters[characterIndex].boundingBox.controlPointRect();
                if (!characterRect.isValid()) {
                    continue;
                }
                rect = hasRect ? rect.united(characterRect) : characterRect;
                hasRect = true;
            }

            if (hasRect && rect.isValid()) {
                rects.append(rectToJson(rect));
            }
        }
    }

    return rects;
}

QJsonArray defaultHighlightColor() {
    QJsonArray color;
    color.append(1.0);
    color.append(1.0);
    color.append(0.0);
    return color;
}

QJsonArray highlightColorFromParams(const QJsonObject& params) {
    const QJsonArray requested = params.value("color").toArray();
    if (requested.size() != 3) {
        return defaultHighlightColor();
    }

    QJsonArray color;
    for (const QJsonValue& value : requested) {
        color.append(std::clamp(value.toDouble(0.0), 0.0, 1.0));
    }
    return color;
}

double opacityFromParams(const QJsonObject& params) {
    return std::clamp(params.value("opacity").toDouble(0.25), 0.0, 1.0);
}

PageIndicesResult pageIndicesFromParams(const pdf::PDFCatalog* catalog, const QJsonObject& params) {
    PageIndicesResult result;
    if (!catalog) {
        result.errorCode = -32011;
        result.errorMessage = "PDF4QT document has no catalog.";
        return result;
    }

    const pdf::PDFInteger pageCount = static_cast<pdf::PDFInteger>(catalog->getPageCount());
    const QJsonValue value = params.value("page_indices");
    if (value.isUndefined() || value.isNull()) {
        result.ok = true;
        for (pdf::PDFInteger index = 0; index < pageCount; ++index) {
            result.indices.push_back(index);
        }
        return result;
    }
    if (!value.isArray()) {
        result.errorMessage = "page_indices must be an array of zero-based page numbers.";
        return result;
    }

    std::set<pdf::PDFInteger> seen;
    for (const QJsonValue& item : value.toArray()) {
        const int pageIndex = item.toInt(-1);
        if (pageIndex < 0 || pageIndex >= pageCount) {
            result.errorMessage = QString("Page index out of range: %1").arg(pageIndex);
            return result;
        }
        if (seen.insert(pageIndex).second) {
            result.indices.push_back(pageIndex);
        }
    }
    if (result.indices.empty()) {
        result.errorMessage = "At least one page must be selected.";
        return result;
    }

    result.ok = true;
    return result;
}

pdf::PDFTextLayout textLayoutForPage(
    const pdf::PDFPage* page,
    pdf::PDFDocument& document,
    TextLayoutContext& context
) {
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

pdf::PDFTextFlows textFlowsForLayout(const pdf::PDFTextLayout& textLayout, pdf::PDFInteger pageIndex) {
    return pdf::PDFTextFlow::createTextFlows(
        textLayout,
        pdf::PDFTextFlow::FlowFlags(pdf::PDFTextFlow::SeparateBlocks) | pdf::PDFTextFlow::RemoveSoftHyphen,
        pageIndex
    );
}

Pdf4qtAdapterResponse findTextInDocument(
    const QString& path,
    const QString& query,
    bool caseSensitive,
    const QJsonArray& color,
    double opacity
) {
    if (query.trimmed().isEmpty()) {
        return makeError(-32602, "Missing text query.");
    }

    ReadDocumentResult read = readDocument(path);
    if (!read.ok) {
        return makeError(read.errorCode, read.errorMessage);
    }

    pdf::PDFDocument& document = read.document;
    const pdf::PDFCatalog* catalog = document.getCatalog();
    if (!catalog) {
        return makeError(-32011, "PDF4QT document has no catalog.");
    }

    TextLayoutContext textContext(document);

    QJsonArray matches;
    QJsonArray operations;
    int matchIndex = 0;
    const Qt::CaseSensitivity sensitivity = caseSensitive ? Qt::CaseSensitive : Qt::CaseInsensitive;

    for (pdf::PDFInteger pageIndex = 0; pageIndex < static_cast<pdf::PDFInteger>(catalog->getPageCount()); ++pageIndex) {
        const pdf::PDFPage* page = catalog->getPage(pageIndex);
        if (!page) {
            continue;
        }

        const pdf::PDFTextLayout textLayout = textLayoutForPage(page, document, textContext);
        const pdf::PDFTextFlows flows = textFlowsForLayout(textLayout, pageIndex);

        for (const pdf::PDFTextFlow& flow : flows) {
            const pdf::PDFFindResults results = flow.find(query, sensitivity);
            for (const pdf::PDFFindResult& found : results) {
                const QJsonArray rects = selectionRectsToJson(textLayout, found.textSelectionItems);
                if (rects.isEmpty()) {
                    continue;
                }

                QJsonObject match;
                match.insert("page", static_cast<int>(pageIndex));
                match.insert("matched", found.matched);
                match.insert("context", found.context);
                match.insert("rects", rects);
                matches.append(match);

                QJsonObject operation;
                operation.insert("id", QString("pdf4qt-p%1-m%2").arg(pageIndex).arg(matchIndex));
                operation.insert("page", static_cast<int>(pageIndex));
                operation.insert("rects", rects);
                operation.insert("color", color);
                operation.insert("opacity", opacity);
                operation.insert("text", found.matched);
                operations.append(operation);
                ++matchIndex;
            }
        }
    }

    QJsonObject result;
    result.insert("path", path);
    result.insert("query", query);
    result.insert("case_sensitive", caseSensitive);
    result.insert("count", matches.size());
    result.insert("matches", matches);
    result.insert("operations", operations);
    result.insert("engine", "PDF4QT");
    return makeResult(result);
}

QString pageTextFromFlows(const pdf::PDFTextFlows& flows) {
    QStringList lines;
    for (const pdf::PDFTextFlow& flow : flows) {
        const QString text = flow.getText().trimmed();
        if (!text.isEmpty()) {
            lines.append(text);
        }
    }
    return lines.join("\n");
}

Pdf4qtAdapterResponse exportTextFromDocument(const QString& path, const QJsonObject& params) {
    const QString format = params.value("format").toString("text").trimmed().toLower();
    if (format != "text" && format != "markdown") {
        return makeError(-32602, QString("Unsupported text export format: %1").arg(format));
    }

    ReadDocumentResult read = readDocument(path);
    if (!read.ok) {
        return makeError(read.errorCode, read.errorMessage);
    }

    pdf::PDFDocument& document = read.document;
    const pdf::PDFCatalog* catalog = document.getCatalog();
    PageIndicesResult pages = pageIndicesFromParams(catalog, params);
    if (!pages.ok) {
        return makeError(pages.errorCode, pages.errorMessage);
    }

    TextLayoutContext textContext(document);
    QStringList output;
    QJsonArray exportedPages;

    for (pdf::PDFInteger pageIndex : pages.indices) {
        const pdf::PDFPage* page = catalog->getPage(pageIndex);
        if (!page) {
            continue;
        }
        const pdf::PDFTextLayout textLayout = textLayoutForPage(page, document, textContext);
        const QString text = pageTextFromFlows(textFlowsForLayout(textLayout, pageIndex));
        exportedPages.append(static_cast<int>(pageIndex));
        if (format == "markdown") {
            output.append(QString("## Page %1\n\n%2").arg(pageIndex + 1).arg(text));
        } else {
            output.append(text);
        }
    }

    const QString exportedText = output.join(format == "markdown" ? "\n\n" : "\n\n");
    const QString outputPath = params.value("output_path").toString().trimmed();
    if (!outputPath.isEmpty()) {
        QFile file(outputPath);
        if (!file.open(QIODevice::WriteOnly | QIODevice::Text | QIODevice::Truncate)) {
            return makeError(-32012, QString("Failed to write text export: %1").arg(outputPath));
        }
        file.write(exportedText.toUtf8());
        file.close();
    }

    QJsonObject result;
    result.insert("path", path);
    result.insert("format", format);
    result.insert("page_count", static_cast<int>(exportedPages.size()));
    result.insert("page_indices", exportedPages);
    result.insert("text", exportedText);
    if (!outputPath.isEmpty()) {
        result.insert("output_path", outputPath);
    }
    result.insert("engine", "PDF4QT");
    return makeResult(result);
}

#endif

} // namespace

QJsonObject Pdf4qtAdapter::status() const {
    QJsonObject result;
    result.insert("host", "inkwell-pdf4qt-host");
    result.insert("protocol_version", 1);
    result.insert("pdf4qt_source", pdf4qtSourceDir());

#ifdef INKWELL_ENABLE_PDF4QT_ADAPTER
    result.insert("pdf4qt_adapter", true);
    result.insert("message", "PDF4QT core adapter linked.");
#else
    result.insert("pdf4qt_adapter", false);
    result.insert("message", "PDF4QT adapter not linked. Reconfigure with -DINKWELL_USE_BUNDLED_PDF4QT=ON after installing Qt6 and PDF4QT native dependencies.");
#endif

    return result;
}

Pdf4qtAdapterResponse Pdf4qtAdapter::handle(const QString& method, const QJsonObject& params) {
    if (method == "host_status") {
        return makeResult(status());
    }

#ifdef INKWELL_ENABLE_PDF4QT_ADAPTER
    if (method == "open_document") {
        return openDocument(params);
    }
    if (method == "document_info") {
        return documentInfo(params);
    }
    if (method == "find_text") {
        return findText(params);
    }
    if (method == "preview_highlights") {
        return previewHighlights(params);
    }
    if (method == "export_text") {
        return exportText(params);
    }

    return makeError(-32001, QString("PDF4QT command is linked but not implemented yet: %1").arg(method));
#else
    Q_UNUSED(params);
    return makeError(-32000, "PDF4QT adapter not linked in this build.");
#endif
}

#ifdef INKWELL_ENABLE_PDF4QT_ADAPTER

Pdf4qtAdapterResponse Pdf4qtAdapter::openDocument(const QJsonObject& params) {
    const QString path = params.value("path").toString();
    Pdf4qtAdapterResponse response = readDocumentInfo(path);
    if (response.ok) {
        currentPath = path;
        response.result.insert("opened", true);
    }
    return response;
}

Pdf4qtAdapterResponse Pdf4qtAdapter::documentInfo(const QJsonObject& params) {
    const QString requestedPath = params.value("path").toString();
    const QString path = requestedPath.trimmed().isEmpty() ? currentPath : requestedPath;
    return readDocumentInfo(path);
}

Pdf4qtAdapterResponse Pdf4qtAdapter::findText(const QJsonObject& params) {
    const QString requestedPath = params.value("path").toString();
    const QString path = requestedPath.trimmed().isEmpty() ? currentPath : requestedPath;
    const QString query = params.contains("query") ? params.value("query").toString() : params.value("text").toString();
    const bool caseSensitive = params.value("case_sensitive").toBool(false);
    return findTextInDocument(path, query, caseSensitive, defaultHighlightColor(), 0.25);
}

Pdf4qtAdapterResponse Pdf4qtAdapter::previewHighlights(const QJsonObject& params) {
    const QString requestedPath = params.value("path").toString();
    const QString path = requestedPath.trimmed().isEmpty() ? currentPath : requestedPath;
    const QString query = params.contains("query") ? params.value("query").toString() : params.value("text").toString();
    const bool caseSensitive = params.value("case_sensitive").toBool(false);
    Pdf4qtAdapterResponse response = findTextInDocument(
        path,
        query,
        caseSensitive,
        highlightColorFromParams(params),
        opacityFromParams(params)
    );
    if (response.ok) {
        response.result.insert("preview", true);
    }
    return response;
}

Pdf4qtAdapterResponse Pdf4qtAdapter::exportText(const QJsonObject& params) {
    const QString requestedPath = params.value("path").toString();
    const QString path = requestedPath.trimmed().isEmpty() ? currentPath : requestedPath;
    return exportTextFromDocument(path, params);
}

#endif

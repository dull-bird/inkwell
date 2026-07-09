#pragma once

#include "pdfglobal.h"

#include <QObject>
#include <QString>

#include <vector>

namespace pdfviewer {
class PDFProgramController;
class PDFUndoRedoManager;
}

class InkwellPdfBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString currentDocumentJson READ currentDocumentJson NOTIFY currentDocumentChanged)

public:
    explicit InkwellPdfBridge(QObject* parent = nullptr);

    void setProgramController(pdfviewer::PDFProgramController* controller);
    void setCurrentPath(const QString& path);

    QString currentDocumentJson() const;

    Q_INVOKABLE QString getCurrentDocumentJson() const;
    Q_INVOKABLE QString previewOperationsJson(const QString& batchJson);
    Q_INVOKABLE QString applyOperationsJson(const QString& batchId);
    Q_INVOKABLE QString undoJson();
    Q_INVOKABLE QString redoJson();
    Q_INVOKABLE QString clearPreviewJson(const QString& batchId = QString());

signals:
    void currentDocumentChanged();

private:
    struct PreviewAnnotationRef {
        pdf::PDFObjectReference page;
        pdf::PDFObjectReference annotation;
    };

    struct PreviewBatch {
        QString batchId;
        int operationCount = 0;
        int rectCount = 0;
        std::vector<PreviewAnnotationRef> annotations;
    };

    pdfviewer::PDFUndoRedoManager* undoRedoManager() const;
    QString unsupportedMutationJson(const QString& method) const;
    QString parseErrorJson(const QString& message) const;

    pdfviewer::PDFProgramController* programController = nullptr;
    QString currentPath;
    std::vector<PreviewBatch> activePreviewBatches;
};

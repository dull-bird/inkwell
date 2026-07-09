#pragma once

#include <QUrl>

#include "pdfeditormainwindow.h"

class QDockWidget;
class QString;
class InkwellAgentBridge;
class InkwellPdfBridge;

class InkwellMainWindow : public pdfviewer::PDFEditorMainWindow {
    Q_OBJECT

public:
    explicit InkwellMainWindow(QWidget* parent = nullptr);

    void openInitialDocument(const QString& path);

private:
    QWidget* createAgentPanel();
    QUrl resolveAgentPanelUrl() const;

    QDockWidget* agentDock = nullptr;
    InkwellAgentBridge* agentBridge = nullptr;
    InkwellPdfBridge* pdfBridge = nullptr;
};

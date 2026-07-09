#include "inkwell_main_window.h"

#include "inkwell_agent_bridge.h"
#include "inkwell_pdf_bridge.h"
#include "pdfprogramcontroller.h"

#include <QCoreApplication>
#include <QDir>
#include <QDockWidget>
#include <QFileInfo>
#include <QLabel>
#include <QUrl>
#include <QVBoxLayout>
#include <QWidget>

#ifdef INKWELL_ENABLE_AGENT_WEBVIEW
#include <QWebChannel>
#include <QWebEngineView>
#endif

namespace {

constexpr auto kAgentPanelOverrideEnv = "INKWELL_AGENT_PANEL_URL";
constexpr auto kAgentPanelDevUrl = "http://127.0.0.1:5173/?surface=native-panel";
constexpr auto kNativePanelQuery = "surface=native-panel";

QUrl withNativePanelQuery(QUrl url)
{
    if (!url.query().contains(QStringLiteral("surface="))) {
        QString query = url.query();
        if (!query.isEmpty()) {
            query.append(QChar('&'));
        }
        query.append(QString::fromLatin1(kNativePanelQuery));
        url.setQuery(query);
    }
    return url;
}

QString findBundledAgentPanelIndex()
{
    const QDir applicationDir(QCoreApplication::applicationDirPath());
    const QStringList candidates = {
        applicationDir.filePath(QStringLiteral("../Resources/agent-panel/index.html")),
        applicationDir.filePath(QStringLiteral("agent-panel/index.html")),
        applicationDir.filePath(QStringLiteral("../agent-panel/index.html")),
    };

    for (const QString& candidate : candidates) {
        const QFileInfo info(candidate);
        if (info.exists() && info.isFile()) {
            return info.canonicalFilePath();
        }
    }

    return {};
}

} // namespace

InkwellMainWindow::InkwellMainWindow(QWidget* parent)
    : pdfviewer::PDFEditorMainWindow(parent)
{
    setWindowTitle(tr("Inkwell"));

    pdfBridge = new InkwellPdfBridge(this);
    pdfBridge->setProgramController(getProgramController());
    agentBridge = new InkwellAgentBridge(this);

    agentDock = new QDockWidget(tr("Agent Panel"), this);
    agentDock->setObjectName(QStringLiteral("inkwell-agent-panel"));
    agentDock->setAllowedAreas(Qt::LeftDockWidgetArea | Qt::RightDockWidgetArea);
    agentDock->setWidget(createAgentPanel());
    addDockWidget(Qt::RightDockWidgetArea, agentDock);
}

void InkwellMainWindow::openInitialDocument(const QString& path)
{
    if (!path.trimmed().isEmpty()) {
        getProgramController()->openDocument(path);
        pdfBridge->setCurrentPath(path);
    }
}

QWidget* InkwellMainWindow::createAgentPanel()
{
#ifdef INKWELL_ENABLE_AGENT_WEBVIEW
    auto* view = new QWebEngineView(this);
    auto* channel = new QWebChannel(view);
    channel->registerObject(QStringLiteral("agentHostBridge"), agentBridge);
    channel->registerObject(QStringLiteral("pdfOperationBridge"), pdfBridge);
    view->page()->setWebChannel(channel);

    view->setUrl(resolveAgentPanelUrl());
    return view;
#else
    auto* panel = new QWidget(this);
    auto* layout = new QVBoxLayout(panel);
    auto* label = new QLabel(
        tr("Agent panel WebView is not compiled in. Reconfigure with INKWELL_ENABLE_AGENT_WEBVIEW=ON after installing Qt WebEngine."),
        panel
    );
    label->setWordWrap(true);
    layout->addWidget(label);
    layout->addStretch(1);
    return panel;
#endif
}

QUrl InkwellMainWindow::resolveAgentPanelUrl() const
{
    const QString overrideUrl = qEnvironmentVariable(kAgentPanelOverrideEnv).trimmed();
    if (!overrideUrl.isEmpty()) {
        return QUrl(overrideUrl);
    }

    const QString bundledPanelIndex = findBundledAgentPanelIndex();
    if (!bundledPanelIndex.isEmpty()) {
        return withNativePanelQuery(QUrl::fromLocalFile(bundledPanelIndex));
    }

    return QUrl(QString::fromLatin1(kAgentPanelDevUrl));
}

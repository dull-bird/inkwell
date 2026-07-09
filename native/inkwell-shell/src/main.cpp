#include "inkwell_main_window.h"

#include "pdfapplicationtranslator.h"
#include "pdfconstants.h"
#include "pdfsecurityhandler.h"
#include "pdfsettings.h"
#include "pdfviewersettings.h"
#include "pdfwidgetutils.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QCoreApplication>
#include <QIcon>

int main(int argc, char* argv[])
{
    QApplication::setAttribute(Qt::AA_CompressHighFrequencyEvents, true);

    QApplication application(argc, argv);
    QCoreApplication::setOrganizationName(QStringLiteral("Inkwell"));
    QCoreApplication::setApplicationName(QStringLiteral("Inkwell"));
    QCoreApplication::setApplicationVersion(pdf::PDF_LIBRARY_VERSION);
    QApplication::setApplicationDisplayName(QApplication::translate("Application", "Inkwell"));

    QCommandLineOption noDrm(QStringLiteral("no-drm"), QStringLiteral("Disable DRM settings for documents."));
    QCommandLineOption lightGui(QStringLiteral("theme-light"), QStringLiteral("Use a light theme for the GUI."));
    QCommandLineOption darkGui(QStringLiteral("theme-dark"), QStringLiteral("Use a dark theme for the GUI."));
    QCommandLineOption configPath = pdf::PDFSettings::getConfigPathOption();

    QCommandLineParser parser;
    parser.setApplicationDescription(QCoreApplication::applicationName());
    parser.addOption(noDrm);
    parser.addOption(lightGui);
    parser.addOption(darkGui);
    parser.addOption(configPath);
    parser.addHelpOption();
    parser.addVersionOption();
    parser.addPositionalArgument(QStringLiteral("file"), QStringLiteral("The PDF file to open."));
    parser.process(application);

    pdf::PDFSettings::applyCommandLineSettingsPath(parser);
    if (parser.isSet(noDrm)) {
        pdf::PDFSecurityHandler::setNoDRMMode();
    }

    pdf::PDFApplicationTranslator translator;
    translator.loadSettings();
    translator.installTranslator();

    bool isLightGui = false;
    bool isDarkGui = false;
    const pdfviewer::PDFViewerSettings::ColorScheme colorScheme = pdfviewer::PDFViewerSettings::getColorSchemeStatic();
    switch (colorScheme) {
    case pdfviewer::PDFViewerSettings::AutoScheme:
        isLightGui = parser.isSet(lightGui);
        isDarkGui = parser.isSet(darkGui);
        break;
    case pdfviewer::PDFViewerSettings::LightScheme:
        isLightGui = true;
        break;
    case pdfviewer::PDFViewerSettings::DarkScheme:
        isDarkGui = true;
        break;
    default:
        break;
    }
    pdf::PDFWidgetUtils::setDarkTheme(isLightGui, isDarkGui);

    QIcon appIcon(QStringLiteral(":/app-icon.svg"));
    QApplication::setWindowIcon(appIcon);

    InkwellMainWindow mainWindow;
    mainWindow.show();

    const QStringList arguments = parser.positionalArguments();
    if (!arguments.isEmpty()) {
        mainWindow.openInitialDocument(arguments.front());
    }

    return application.exec();
}

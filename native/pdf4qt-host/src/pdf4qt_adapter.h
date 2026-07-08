#pragma once

#include <QJsonObject>
#include <QString>

struct Pdf4qtAdapterResponse {
    bool ok = false;
    QJsonObject result;
    int errorCode = -32000;
    QString errorMessage;
};

class Pdf4qtAdapter {
public:
    QJsonObject status() const;
    Pdf4qtAdapterResponse handle(const QString& method, const QJsonObject& params);

private:
#ifdef INKWELL_ENABLE_PDF4QT_ADAPTER
    Pdf4qtAdapterResponse openDocument(const QJsonObject& params);
    Pdf4qtAdapterResponse documentInfo(const QJsonObject& params);
    Pdf4qtAdapterResponse findText(const QJsonObject& params);
    Pdf4qtAdapterResponse previewHighlights(const QJsonObject& params);
    Pdf4qtAdapterResponse exportText(const QJsonObject& params);
    QString currentPath;
#endif
};

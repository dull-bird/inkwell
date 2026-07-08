#include <QCoreApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QJsonValue>
#include <QString>
#include <QStringList>

#include <iostream>
#include <string>

#include "pdf4qt_adapter.h"

namespace {

const QStringList kKnownMethods = {
    "open_document",
    "host_status",
    "document_info",
    "find_text",
    "preview_highlights",
    "read_form_fields",
    "fill_form",
    "free_text_annotation",
    "stamp_annotation",
    "shape_annotation",
    "insert_image",
    "underline_text",
    "strikeout_text",
    "redact_text",
    "typed_signature",
    "image_signature",
    "extract_pages",
    "insert_blank_pages",
    "export_pages_as_images",
    "extract_images",
    "export_text",
    "images_to_pdf",
    "html_to_pdf",
    "markdown_to_pdf",
    "crop_pages",
    "resize_pages",
    "read_outline",
    "set_outline",
    "list_attachments",
    "add_attachment",
    "extract_attachments",
    "remove_attachments",
    "compress_pdf",
    "apply_operations",
    "undo",
    "redo",
    "save_as",
};

QJsonValue requestIdOrNull(const QJsonObject& request) {
    const QJsonValue id = request.value("id");
    return id.isUndefined() ? QJsonValue(QJsonValue::Null) : id;
}

QJsonObject makeError(const QJsonValue& id, int code, const QString& message) {
    QJsonObject error;
    error.insert("code", code);
    error.insert("message", message);

    QJsonObject response;
    response.insert("jsonrpc", "2.0");
    response.insert("id", id);
    response.insert("error", error);
    return response;
}

QJsonObject makeResult(const QJsonValue& id, const QJsonObject& result) {
    QJsonObject response;
    response.insert("jsonrpc", "2.0");
    response.insert("id", id);
    response.insert("result", result);
    return response;
}

QJsonObject handleRequest(Pdf4qtAdapter& adapter, const QJsonObject& request) {
    const QJsonValue id = requestIdOrNull(request);
    if (request.value("jsonrpc").toString() != "2.0") {
        return makeError(id, -32600, "Expected JSON-RPC 2.0 request.");
    }

    const QString method = request.value("method").toString();
    if (!kKnownMethods.contains(method)) {
        return makeError(id, -32601, QString("Unknown native PDF method: %1").arg(method));
    }

    const QJsonValue paramsValue = request.value("params");
    QJsonObject params;
    if (!paramsValue.isUndefined() && !paramsValue.isNull()) {
        if (!paramsValue.isObject()) {
            return makeError(id, -32602, "Native PDF command params must be an object.");
        }
        params = paramsValue.toObject();
    }

    const Pdf4qtAdapterResponse adapterResponse = adapter.handle(method, params);
    if (!adapterResponse.ok) {
        return makeError(id, adapterResponse.errorCode, adapterResponse.errorMessage);
    }
    return makeResult(id, adapterResponse.result);
}

int runStdioJson() {
    Pdf4qtAdapter adapter;
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) {
            continue;
        }

        QJsonParseError parseError;
        const QJsonDocument requestDocument = QJsonDocument::fromJson(QByteArray::fromStdString(line), &parseError);
        QJsonObject response;
        if (parseError.error != QJsonParseError::NoError || !requestDocument.isObject()) {
            response = makeError(QJsonValue(QJsonValue::Null), -32700, parseError.errorString());
        } else {
            response = handleRequest(adapter, requestDocument.object());
        }

        const QJsonDocument responseDocument(response);
        std::cout << responseDocument.toJson(QJsonDocument::Compact).toStdString() << std::endl;
    }

    return 0;
}

} // namespace

int main(int argc, char* argv[]) {
    QCoreApplication app(argc, argv);
    if (app.arguments().contains("--stdio-json")) {
        return runStdioJson();
    }

    std::cerr << "Usage: inkwell-pdf4qt-host --stdio-json" << std::endl;
    return 2;
}

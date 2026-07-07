#include <QCoreApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QJsonValue>
#include <QString>
#include <QStringList>

#include <iostream>
#include <string>

namespace {

const QStringList kKnownMethods = {
    "open_document",
    "host_status",
    "document_info",
    "find_text",
    "preview_highlights",
    "read_form_fields",
    "fill_form",
    "typed_signature",
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

QJsonObject handleRequest(const QJsonObject& request) {
    const QJsonValue id = requestIdOrNull(request);
    if (request.value("jsonrpc").toString() != "2.0") {
        return makeError(id, -32600, "Expected JSON-RPC 2.0 request.");
    }

    const QString method = request.value("method").toString();
    if (!kKnownMethods.contains(method)) {
        return makeError(id, -32601, QString("Unknown native PDF method: %1").arg(method));
    }

    if (method == "host_status") {
        QJsonObject result;
        result.insert("host", "inkwell-pdf4qt-host");
        result.insert("protocol_version", 1);
        result.insert("pdf4qt_adapter", false);
        result.insert("message", "PDF4QT adapter not linked in this scaffold build.");
        return makeResult(id, result);
    }

    return makeError(id, -32000, "PDF4QT adapter not linked in this scaffold build.");
}

int runStdioJson() {
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
            response = handleRequest(requestDocument.object());
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

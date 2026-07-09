#include "inkwell_agent_bridge.h"

#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

namespace {

QString compactJson(const QJsonObject& object)
{
    return QString::fromUtf8(QJsonDocument(object).toJson(QJsonDocument::Compact));
}

QJsonArray fallbackModes()
{
    return QJsonArray{
        QJsonObject{ { QStringLiteral("id"), QStringLiteral("ask") }, { QStringLiteral("name"), QStringLiteral("Ask") } },
        QJsonObject{ { QStringLiteral("id"), QStringLiteral("plan") }, { QStringLiteral("name"), QStringLiteral("Plan") } },
        QJsonObject{ { QStringLiteral("id"), QStringLiteral("edit") }, { QStringLiteral("name"), QStringLiteral("Edit") } },
        QJsonObject{ { QStringLiteral("id"), QStringLiteral("review") }, { QStringLiteral("name"), QStringLiteral("Review") } },
    };
}

bool isAgentKind(const QString& kind)
{
    return kind == QStringLiteral("claude") || kind == QStringLiteral("codex") || kind == QStringLiteral("kimi");
}

}

InkwellAgentBridge::InkwellAgentBridge(QObject* parent)
    : QObject(parent)
{
}

QString InkwellAgentBridge::getAgentKindJson() const
{
    return compactJson({ { QStringLiteral("kind"), agentKind } });
}

QString InkwellAgentBridge::setAgentKindJson(const QString& kind)
{
    if (isAgentKind(kind)) {
        agentKind = kind;
        return compactJson({ { QStringLiteral("ok"), true }, { QStringLiteral("kind"), agentKind } });
    }

    return compactJson({
        { QStringLiteral("ok"), false },
        { QStringLiteral("kind"), agentKind },
        { QStringLiteral("message"), QStringLiteral("Unknown agent kind.") },
    });
}

QString InkwellAgentBridge::getAgentCatalogJson(const QString& kind) const
{
    return compactJson({
        { QStringLiteral("models"), QJsonArray{} },
        { QStringLiteral("modes"), fallbackModes() },
        {
            QStringLiteral("unavailableReason"),
            QStringLiteral("%1 native agent host is not configured yet.").arg(kind),
        },
    });
}

void InkwellAgentBridge::sendAgentPromptJson(const QString& prompt, const QString& turnId, const QString& optionsJson)
{
    Q_UNUSED(prompt);
    Q_UNUSED(optionsJson);

    Q_EMIT agentEventJson(compactJson({
        { QStringLiteral("type"), QStringLiteral("error") },
        { QStringLiteral("message"), QStringLiteral("Native agent host is not configured yet.") },
        { QStringLiteral("turnId"), turnId },
    }));
    Q_EMIT agentEventJson(compactJson({
        { QStringLiteral("type"), QStringLiteral("done") },
        { QStringLiteral("turnId"), turnId },
    }));
}

void InkwellAgentBridge::stopAgentPromptJson(const QString& turnId)
{
    Q_EMIT agentEventJson(compactJson({
        { QStringLiteral("type"), QStringLiteral("aborted") },
        { QStringLiteral("turnId"), turnId },
    }));
}

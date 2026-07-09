#pragma once

#include <QObject>
#include <QString>

class InkwellAgentBridge : public QObject {
    Q_OBJECT

public:
    explicit InkwellAgentBridge(QObject* parent = nullptr);

    Q_INVOKABLE QString getAgentKindJson() const;
    Q_INVOKABLE QString setAgentKindJson(const QString& kind);
    Q_INVOKABLE QString getAgentCatalogJson(const QString& kind) const;
    Q_INVOKABLE void sendAgentPromptJson(const QString& prompt, const QString& turnId, const QString& optionsJson);
    Q_INVOKABLE void stopAgentPromptJson(const QString& turnId);

    Q_SIGNAL void agentEventJson(const QString& eventJson);

private:
    QString agentKind = QStringLiteral("claude");
};

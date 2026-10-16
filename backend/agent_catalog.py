"""Persistent visibility, with presentation and service destinations from configuration."""
from backend.database import database


def sync_agents(registry):
    with database() as db:
        for position, agent in enumerate(registry.values()):
            db.execute('''INSERT INTO platform.agents (agent_id,name,enabled,sort_order) VALUES (%s,%s,%s,%s)
                ON CONFLICT (agent_id) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order''',
                (agent.id, agent.name, agent.enabled, position))


def catalog_rows(registry):
    with database() as db:
        rows = db.execute('SELECT agent_id,enabled,sort_order,updated_at FROM platform.agents ORDER BY sort_order,agent_id').fetchall()
    return [row for row in rows if row['agent_id'] in registry]


def active_registry(registry):
    return {row['agent_id']: registry[row['agent_id']] for row in catalog_rows(registry) if row['enabled']}

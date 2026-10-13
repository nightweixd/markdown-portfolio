import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const alertRules = sqliteTable("alert_rules", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  filters: text("filters").notNull(),
  source: text("source").notNull(),
  view: text("view").notNull(),
  interval: text("interval").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
export const alertDeliveries = sqliteTable("alert_deliveries", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  address: text("address").notNull(),
  sentAt: integer("sent_at").notNull(),
});

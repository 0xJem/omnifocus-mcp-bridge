import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const READ_ONLY_TOOL_NAMES = new Set([
  "dump_database",
  "get_task_by_id",
  "read_task_attachment",
  "get_today_completed_tasks",
  "get_inbox_tasks",
  "get_flagged_tasks",
  "get_forecast_tasks",
  "get_tasks_by_tag",
  "filter_tasks",
  "list_custom_perspectives",
  "get_custom_perspective_tasks",
]);

export type ToolPolicy = {
  readOnly: boolean;
};

export function canExposeTool(toolName: string, policy: ToolPolicy): boolean {
  if (!policy.readOnly) {
    return true;
  }

  return READ_ONLY_TOOL_NAMES.has(toolName);
}

export function filterToolsForPolicy<T extends Pick<Tool, "name">>(
  tools: T[],
  policy: ToolPolicy,
): T[] {
  return tools.filter((tool) => canExposeTool(tool.name, policy));
}

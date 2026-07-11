import { financeReadTools } from "./read/financeReadTools.server";
import type {
  AIFinanceToolDefinition,
  AIFinanceToolRegistration,
} from "./aiToolTypes";
import { financeWriteTools } from "./write/financeWriteTools.server";

type RegistryTool = AIFinanceToolRegistration<unknown>;

const registrations: RegistryTool[] = [
  ...financeReadTools.map((tool) => tool as RegistryTool),
  ...financeWriteTools.map((tool) => tool as RegistryTool),
];

const registry = new Map<string, RegistryTool>();

for (const tool of registrations) {
  registry.set(tool.name, tool);
}

export function getAIFinanceTool(name: string): RegistryTool | undefined {
  return registry.get(name);
}

export function getAIFinanceToolDefinitions(): AIFinanceToolDefinition[] {
  return registrations.map((tool) => tool.definition);
}

export function listAIFinanceTools() {
  return registrations.map((tool) => ({
    name: tool.name,
    mode: tool.mode,
    description: tool.description,
  }));
}

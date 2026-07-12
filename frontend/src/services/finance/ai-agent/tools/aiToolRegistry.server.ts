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
  if (registry.has(tool.name)) {
    throw new Error(`Duplicate AI finance tool registration: ${tool.name}`);
  }

  registry.set(tool.name, tool);
}

export function getAIFinanceTool(name: string): RegistryTool | undefined {
  return registry.get(name);
}

export function getAIFinanceToolDefinitions(): AIFinanceToolDefinition[] {
  return registrations.map((tool) => tool.definition);
}

export function listAIFinanceTools() {
  return registrations
    .map((tool) => ({
      name: tool.name,
      mode: tool.mode,
      description: tool.description,
      capabilities: tool.semantic.capabilities,
      returns: tool.semantic.returns,
      useWhen: tool.semantic.useWhen,
      doNotUseWhen: tool.semantic.doNotUseWhen,
      examples: tool.semantic.examples,
      priority: tool.semantic.priority,
    }))
    .sort(
      (left, right) =>
        right.priority - left.priority || left.name.localeCompare(right.name),
    );
}

export function findAIFinanceToolsByCapability(capability: string) {
  return registrations
    .filter((tool) => tool.semantic.capabilities.includes(capability))
    .sort((left, right) => right.semantic.priority - left.semantic.priority);
}

export function listAIFinanceToolRegistrations(): readonly AIFinanceToolRegistration<unknown>[] {
  return registrations;
}

import zodToJsonSchema from "zod-to-json-schema";
import type {
  AnyAction,
  ContextState,
  InputRef,
  Log,
  Output,
  OutputRef,
  WorkingMemory,
  XMLElement,
} from "./types";
import { formatXml } from "./xml";
import { formatValue } from "./utils";
import { renderWorkingMemory } from "./context";
import { z } from "zod";
import { type Schema } from "@ai-sdk/ui-utils";

/**
 * Formats an input reference into XML format
 * @param input - The input reference to format
 * @returns XML string representation of the input
 */
export function formatInput(input: InputRef) {
  return formatXml({
    tag: "input",
    params: { name: input.type, ...input.params },
    content:
      typeof input.data === "string" ? input.data : JSON.stringify(input.data),
  });
}

/**
 * Formats an output reference into XML format
 * @param output - The output reference to format
 * @returns XML string representation of the output
 */
export function formatOutput(output: OutputRef) {
  return formatXml({
    tag: "output",
    params: { name: output.type, ...output.params },
    content:
      typeof output.data === "string"
        ? output.data
        : JSON.stringify(output.data),
  });
}

export function formatSchema(schema: any, key?: string) {
  return JSON.stringify(
    "_type" in schema
      ? (schema as Schema).jsonSchema
      : zodToJsonSchema("parse" in schema ? schema : z.object(schema), key)
  );
}

/**
 * Formats an output interface definition into XML format
 * @param output - The output interface to format
 * @returns XML string representation of the output interface
 */
export function formatOutputInterface(output: Output<any>) {
  const params: Record<string, string> = {
    name: output.type,
  };

  if (output.required) {
    params.required = "true";
  }

  return formatXml({
    tag: "output",
    params,
    content: [
      output.description
        ? { tag: "description", content: output.description }
        : null,
      output.attributes
        ? {
            tag: "attributes",
            content: formatSchema(output.attributes, "attributes"),
          }
        : null,
      output.schema
        ? {
            tag: "schema",
            content: formatSchema(output.schema, "schema"),
          }
        : null,
      output.instructions
        ? { tag: "instructions", content: output.instructions }
        : null,

      output.examples
        ? {
            tag: "examples",
            content: output.examples.join("\n"),
          }
        : null,
    ].filter((c) => !!c),
  });
}

export function formatAction(action: AnyAction) {
  return formatXml({
    tag: "action",
    params: { name: action.name },
    content: [
      action.description
        ? {
            tag: "description",
            content: action.description,
          }
        : null,
      action.instructions
        ? {
            tag: "instructions",
            content: action.instructions,
          }
        : null,
      action.schema
        ? {
            tag: "schema",
            content: formatSchema(action.schema, "schema"),
          }
        : null,
    ].filter((t) => !!t),
  });
}

export function formatContext({
  type,
  key,
  description,
  instructions,
  content,
}: {
  type: string;
  key: string;
  description?: string | string[];
  instructions?: string | string[];
  content: XMLElement["content"];
}) {
  return formatXml({
    tag: "context",
    params: { type, key },
    content: [
      description
        ? formatXml({ tag: "description", content: description })
        : "",
      instructions
        ? formatXml({
            tag: "instructions",
            content: instructions,
          })
        : "",
      content,
    ]
      .filter((t) => !!t)
      .flat(),
  });
}

export type Msg =
  | {
      role: "user";
      user: string;
      content: string;
    }
  | {
      role: "assistant";
      content: string;
    };

export function formatMsg(msg: Msg) {
  return formatXml({
    tag: "msg",
    params:
      msg.role === "user"
        ? {
            role: "user",
            user: msg.user,
          }
        : { role: "assistant" },
    content: msg.content,
  });
}

export function formatContextLog(i: Log) {
  switch (i.ref) {
    case "input":
      return (
        i.formatted ??
        formatXml({
          tag: "msg",
          params: {
            ...i.params,
            role: "user",
          },
          content: formatValue(i.data),
        })
      );
    case "output":
      return (
        i.formatted ??
        formatXml({
          tag: "output",
          params: {
            type: i.type,
            ...i.params,
            // role: "assistant",
          },
          content: formatValue(i.data),
        })
      );
    case "thought":
      return formatXml({
        tag: "reasoning",
        // params: { role: "assistant" },
        content: i.content,
      });
    case "action_call":
      return formatXml({
        tag: "action_call",
        params: { id: i.id, name: i.name },
        content: JSON.stringify(i.data),
      });
    case "action_result":
      return formatXml({
        tag: "action_result",
        params: { name: i.name, callId: i.callId },
        content: i.formatted ?? JSON.stringify(i.data),
      });
    default:
      throw new Error("invalid context");
  }
}

export function formatContexts(
  mainContextId: string,
  contexts: ContextState[],
  workingMemory: WorkingMemory
) {
  return contexts
    .map(
      ({
        id,
        context,
        key,
        args,
        memory,
        options,
        settings,
        contexts: subContexts,
      }) =>
        formatContext({
          type: context.type,
          key: key,
          description:
            typeof context.description === "function"
              ? context.description({
                  key,
                  args,
                  options,
                  id,
                  context,
                  memory,
                  settings,
                  contexts: subContexts,
                })
              : context.description,
          instructions:
            typeof context.instructions === "function"
              ? context.instructions({
                  key,
                  args,
                  options,
                  id,
                  context,
                  memory,
                  settings,
                  contexts: subContexts,
                })
              : context.instructions,
          content: [
            context.render
              ? context.render({
                  id,
                  context,
                  key,
                  args,
                  memory,
                  options,
                  settings,
                  contexts: subContexts,
                })
              : "",
            mainContextId === id
              ? formatXml({
                  tag: "working-memory",
                  content: renderWorkingMemory({
                    memory: workingMemory,
                    processed: true,
                    size: context.maxWorkingMemorySize ?? undefined,
                  }),
                })
              : "",
          ]
            .flat()
            .filter((t) => !!t),
        })
    )
    .flat()
    .join("\n");
}

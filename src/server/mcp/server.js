/**
 * The MCP server for one request (stateless: a connection is a key, there is no session to keep).
 * It advertises exactly the tools this connection may use, the playbook (instructions) and four starter prompts.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toolsFor, annotationsOf } from '../../shared/mcpTools/catalogue.js';
import { SERVER_INSTRUCTIONS, PROMPTS } from '../../shared/mcpTools/instructions.js';

export const SERVER_INFO = Object.freeze({ name: 'tachtach-screens', version: '1.0.0' });

export function createMcpServer({ ctx, dispatch }) {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {}, prompts: {} }, instructions: SERVER_INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolsFor({ caps: ctx.caps, mode: ctx.mode }).map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: annotationsOf(t),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => dispatch(ctx, req.params.name, req.params.arguments));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const p = PROMPTS.find((x) => x.name === req.params.name);
    if (!p) throw new Error('Unknown prompt.');
    return { description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text } }] };
  });

  return server;
}

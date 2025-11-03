import { test } from "tap";
import { env } from "../../src/env.ts";

type OpenAIServiceModule = typeof import("../../src/services/openai.ts");

test("generateSimpleResponse returns assistant message content", async (t) => {
  const completionsCreate = async ({
    model,
    messages,
  }: {
    model: string;
    messages: Array<{ role: string; content: string }>;
  }) => {
    t.equal(model, env.OPENAI_MODEL);
    t.same(messages, [{ role: "user", content: "Hello" }]);
    return {
      choices: [
        {
          message: { role: "assistant", content: "Hi there" },
        },
      ],
      usage: { total_tokens: 10 },
    };
  };

  const encoder = {
    encode: (value: string) => new Array(value.length).fill(0),
  };

  const { generateSimpleResponse } = (await t.mockImport(
    "../../src/services/openai.ts",
    {
      openai: {
        default: class MockOpenAI {
          public chat = {
            completions: {
              create: completionsCreate,
            },
          };
        },
      },
      tiktoken: {
        encoding_for_model: () => encoder,
      },
    }
  )) as OpenAIServiceModule;

  const reply = await generateSimpleResponse("Hello");

  t.equal(reply, "Hi there");
});

test("generateSimpleResponse throws when OpenAI returns no message", async (t) => {
  const encoder = {
    encode: (value: string) => new Array(value.length).fill(0),
  };

  const { generateSimpleResponse } = (await t.mockImport(
    "../../src/services/openai.ts",
    {
      openai: {
        default: class MockOpenAI {
          public chat = {
            completions: {
              create: async () => ({
                choices: [
                  {
                    message: { role: "assistant" },
                  },
                ],
                usage: { total_tokens: 5 },
              }),
            },
          };
        },
      },
      tiktoken: {
        encoding_for_model: () => encoder,
      },
    }
  )) as OpenAIServiceModule;

  await t.rejects(() => generateSimpleResponse("Hi"), {
    message: "No content returned from OpenAI response",
  });
});

import { expect, test } from "@playwright/test";

const MOCK_WLLAMA_MODULE = String.raw`
export class CacheManager {
  constructor(backends = []) {
    this.backends = backends;
  }
}

export class Wllama {
  constructor(wasmPaths, options) {
    this.loaded = false;
    globalThis.__wllamaTest = {
      activeGenerations: 0,
      maxActiveGenerations: 0,
      chatCalls: [],
      exitCalls: 0,
      loadCall: null,
      wasmPaths,
      hasCacheManager: Boolean(options?.cacheManager),
    };
  }

  isModelLoaded() {
    return this.loaded;
  }

  async loadModel(files, options) {
    this.loaded = true;
    globalThis.__wllamaTest.loadCall = {
      fileNames: files.map((file) => file.name),
      options,
    };
  }

  async createChatCompletion(options) {
    const state = globalThis.__wllamaTest;
    const systemPrompt = options.messages[0]?.content ?? "";
    const kind = systemPrompt.includes("document proofreader")
      ? "proofreading"
      : "suggestion";
    state.chatCalls.push({
      kind,
      maxTokens: options.max_tokens,
      temperature: options.temperature,
      messages: options.messages,
    });
    state.activeGenerations += 1;
    state.maxActiveGenerations = Math.max(
      state.maxActiveGenerations,
      state.activeGenerations,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    state.activeGenerations -= 1;

    const userPrompt = options.messages.at(-1)?.content ?? "";
    const documentMatch = userPrompt.match(/<document>\n([\s\S]*?)\n<\/document>/);
    const proofreadText = (documentMatch?.[1] ?? "")
      .replace(/\bThis are\b/g, "This is")
      .replace(/\bteh\b/g, "the")
      .replace(/\bquiglyy\b/g, "quickly");

    return {
      choices: [
        {
          message: {
            content:
              kind === "proofreading"
                ? proofreadText
                : " useful continuation.",
          },
        },
      ],
    };
  }

  async exit() {
    this.loaded = false;
    globalThis.__wllamaTest.exitCalls += 1;
  }
}
`;

test("AI writing settings expose and persist suggestions and proofreading", async ({
  page,
}) => {
  await page.goto("/");

  const settingsButton = page.getByRole("button", {
    name: "AI writing settings",
  });
  await expect(settingsButton).toBeVisible();
  await settingsButton.hover();
  await expect(page.getByRole("tooltip")).toHaveText("AI writing settings");
  await settingsButton.click();

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Local AI writing" });
  await expect(dialog.getByRole("heading", { name: "Local AI writing" })).toBeVisible();

  const suggestions = dialog.getByRole("switch", {
    name: "Enable text suggestions",
  });
  const proofreadInstruction = dialog.getByRole("textbox", {
    name: "What should AI do?",
  });
  await expect(suggestions).not.toBeChecked();
  await expect(proofreadInstruction).toHaveValue(
    /Correct spelling, grammar, and punctuation/,
  );
  await expect(
    dialog.getByRole("button", { name: "Proofread document" }),
  ).toBeDisabled();

  await suggestions.click();
  await proofreadInstruction.fill("Make the writing concise and fix grammar.");
  await expect(suggestions).toBeChecked();
  await expect(
    dialog.getByText("Autocorrection is", { exact: false }),
  ).toBeVisible();

  await expect(dialog.getByRole("link", { name: "Download GGUF" })).toHaveCount(
    3,
  );
  await expect(
    dialog.getByRole("link", { name: "Model details" }),
  ).toHaveCount(3);
  await expect(
    dialog.getByRole("link", { name: "Download GGUF" }).nth(1),
  ).toHaveAttribute(
    "href",
    /Qwen2\.5-0\.5B-Instruct-GGUF.*qwen2\.5-0\.5b-instruct-q4_k_m\.gguf/,
  );

  const modelSearch = dialog.getByRole("textbox", {
    name: "Search other GGUF models",
  });
  const searchLink = dialog.getByRole("link", {
    name: "Search Hugging Face",
  });
  await expect(searchLink).toHaveAttribute(
    "href",
    "https://huggingface.co/models?search=GGUF&sort=downloads",
  );
  await modelSearch.fill("Llama 3.2 1B Instruct");
  await expect(searchLink).toHaveAttribute(
    "href",
    "https://huggingface.co/models?search=Llama+3.2+1B+Instruct+GGUF&sort=downloads",
  );

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await settingsButton.click();
  await expect(suggestions).toBeChecked();
  await expect(proofreadInstruction).toHaveValue(
    "Make the writing concise and fix grammar.",
  );
});

test("GGUF model search fits inside the mobile settings dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "AI writing settings" })
    .click();

  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Local AI writing" });
  const searchLink = dialog.getByRole("link", {
    name: "Search Hugging Face",
  });
  await expect(searchLink).toHaveCSS("white-space", "normal");

  const dialogBox = await dialog.boundingBox();
  const searchLinkBox = await searchLink.boundingBox();
  if (!dialogBox || !searchLinkBox) {
    throw new Error("Expected the AI settings dialog and search link to render");
  }

  expect(searchLinkBox.x).toBeGreaterThanOrEqual(dialogBox.x);
  expect(searchLinkBox.x + searchLinkBox.width).toBeLessThanOrEqual(
    dialogBox.x + dialogBox.width + 1,
  );
});

test("disabling suggestions keeps the loaded GGUF ready for proofreading", async ({
  page,
}) => {
  await page.route("**/@wllama_wllama_esm_index__js.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: MOCK_WLLAMA_MODULE,
    });
  });
  await page.goto("/");

  await page.getByRole("button", { name: "AI writing settings" }).click();
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Local AI writing" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "session-model.gguf",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("fake GGUF"),
  });
  await expect(dialog.getByText("session-model.gguf", { exact: true })).toBeVisible();

  const suggestions = dialog.getByRole("switch", {
    name: "Enable text suggestions",
  });
  await expect(suggestions).not.toBeChecked();
  await suggestions.click();
  await expect(suggestions).toBeChecked();
  await suggestions.click();
  await expect(suggestions).not.toBeChecked();

  // Turning autocomplete off must not release the session-only File/model;
  // the same model remains available for on-demand proofreading.

  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/textSuggest/wllamaService.ts";
    const { textSuggestService } = await import(modulePath);
    const modelId = Reflect.get(textSuggestService, "loadedModelId") as string;
    const proofreading = await textSuggestService.proofread({
      document: "This are teh text.",
      instruction: "Correct spelling and grammar.",
    });
    const mockState = Reflect.get(globalThis, "__wllamaTest");
    const loaded = textSuggestService.isModelLoaded(modelId);
    const exitCallsBeforeCleanup = mockState.exitCalls;
    await textSuggestService.unload();
    return { loaded, proofreading, exitCallsBeforeCleanup };
  });

  expect(result.loaded).toBe(true);
  expect(result.proofreading.text).toBe("This is the text.");
  expect(result.exitCallsBeforeCleanup).toBe(0);
});

test("proofreading shows an editor diff that can be rejected or accepted", async ({
  page,
}) => {
  await page.route("**/@wllama_wllama_esm_index__js.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: MOCK_WLLAMA_MODULE,
    });
  });
  await page.goto("/");

  const editor = page.locator(".tiptap");
  await editor.click();
  await page.keyboard.type("This are teh text.");

  const settingsButton = page.getByRole("button", {
    name: "AI writing settings",
  });
  await settingsButton.click();
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Local AI writing" });
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "proofreader.gguf",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("fake GGUF"),
  });
  await dialog
    .getByRole("textbox", { name: "What should AI do?" })
    .fill("Correct spelling and grammar.");
  await dialog.getByRole("button", { name: "Proofread document" }).click();

  const review = page.getByRole("region", { name: "Proofreading review" });
  await expect(review).toBeVisible();
  await expect(review.locator("del")).toContainText(["are", "teh"]);
  await expect(review.locator("ins")).toContainText(["is", "the"]);
  await expect(editor).toContainText("This are teh text.");

  await review.getByRole("button", { name: "Reject" }).click();
  await expect(review).toBeHidden();
  await expect(editor).toContainText("This are teh text.");

  await settingsButton.click();
  await dialog.getByRole("button", { name: "Proofread document" }).click();
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Accept" }).click();
  await expect(review).toBeHidden();
  await expect(editor).toContainText("This is the text.");
});

test("Wllama adapter loads GGUF and serializes proofreading with autocomplete", async ({
  page,
}) => {
  await page.route("**/@wllama_wllama_esm_index__js.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: MOCK_WLLAMA_MODULE,
    });
  });
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/textSuggest/wllamaService.ts";
    const { textSuggestService } = await import(modulePath);
    const progress: number[] = [];
    const model = {
      id: "custom:e2e-wllama",
      label: "mock.gguf",
    };

    await textSuggestService.ensureLoadedFromFile(
      new File(["fake GGUF"], "mock.gguf"),
      model,
      ({ bytes }: { bytes: number }) => progress.push(bytes),
    );

    const document = `Please finish this quiglyy. ${"word ".repeat(520)}done`;
    const [proofreading, suggestion] = await Promise.all([
      textSuggestService.proofread({
        document,
        instruction: "Correct spelling.",
      }),
      textSuggestService.suggest(
        { prefix: "This is a" },
        { maxTokens: 24, temperature: 0.35 },
      ),
    ]);

    const loadedBeforeUnload = textSuggestService.isModelLoaded(model.id);
    const mockState = Reflect.get(globalThis, "__wllamaTest");
    await textSuggestService.unload();

    return {
      proofreading,
      documentLength: document.length,
      suggestion,
      progress,
      loadedBeforeUnload,
      loadedAfterUnload: textSuggestService.isModelLoaded(model.id),
      mockState,
    };
  });

  expect(result.progress).toEqual([10, 30, 100]);
  expect(result.loadedBeforeUnload).toBe(true);
  expect(result.loadedAfterUnload).toBe(false);
  expect(result.proofreading.text).toMatch(/^Please finish this quickly\./);
  expect(result.proofreading.text).toMatch(/done$/);
  expect(result.proofreading.text).toHaveLength(result.documentLength);
  expect(result.suggestion.text).toBe(" useful continuation");
  expect(result.mockState.hasCacheManager).toBe(true);
  expect(result.mockState.loadCall.fileNames).toEqual(["mock.gguf"]);
  expect(result.mockState.loadCall.options).toMatchObject({
    n_ctx: 2048,
    jinja: true,
  });
  expect(result.mockState.chatCalls.map((call: { kind: string }) => call.kind)).toEqual([
    "proofreading",
    "proofreading",
    "suggestion",
  ]);
  expect(result.mockState.maxActiveGenerations).toBe(1);
  expect(result.mockState.exitCalls).toBe(1);
});

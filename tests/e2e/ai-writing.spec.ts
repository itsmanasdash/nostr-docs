import { expect, test, type Page } from "@playwright/test";

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

  getLoadedContextInfo() {
    return { n_ctx: this.loadOptions?.n_ctx ?? 8192 };
  }

  async loadModel(files, options) {
    this.loaded = true;
    this.loadOptions = options;
    globalThis.__wllamaTest.loadCall = {
      fileNames: files.map((file) => file.name),
      options,
    };
  }

  async createChatCompletion(options) {
    const state = globalThis.__wllamaTest;
    const systemPrompt = options.messages[0]?.content ?? "";
    const kind = systemPrompt.includes("document revision engine")
      ? "proofread"
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
    await new Promise((resolve) =>
      setTimeout(resolve, state.generationDelayMs ?? 30),
    );
    state.activeGenerations -= 1;

    const userPrompt = options.messages[1]?.content ?? "";
    const documentMatch = userPrompt.match(
      new RegExp(
        "DOCUMENT_(FORMSTR_BOUNDARY_[A-Za-z0-9_]+)\\n([\\s\\S]*?)\\nEND_DOCUMENT_\\1",
      ),
    );
    const sourceDocument = documentMatch?.[2] ?? "";
    const proofreadContent =
      state.proofreadResponse ??
      sourceDocument.replace(/\bteh\b/g, "the").replace(/\bdont\b/g, "don't");

    return {
      choices: [
        {
          finish_reason: "stop",
          message: {
            content:
              kind === "proofread" ? proofreadContent : " useful continuation.",
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

async function useMockWllama(page: Page) {
  await page.route("**/@wllama_wllama_esm_index__js.js*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: MOCK_WLLAMA_MODULE,
    });
  });
}

test("AI writing settings expose text suggestions and free-form proofreading", async ({
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
  await expect(suggestions).not.toBeChecked();
  await expect(
    dialog.getByRole("switch", { name: "Enable AI autocorrection" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: "Proofread document" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: "Fix spelling, grammar, and punctuation",
    }),
  ).toBeVisible();

  const instruction = dialog.getByRole("textbox", {
    name: "What should the proofreader do?",
  });
  await instruction.fill("Use active voice and fix spelling.");
  await expect(instruction).toHaveValue("Use active voice and fix spelling.");
  await expect(dialog.getByRole("button", { name: "Review changes" })).toBeDisabled();
  await expect(dialog.getByText("Start writing before proofreading.")).toBeVisible();
  await expect(
    dialog.getByText("show a diff you can accept or reject", { exact: false }),
  ).toBeVisible();

  await suggestions.click();
  await expect(suggestions).toBeChecked();

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

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await settingsButton.click();
  await expect(suggestions).toBeChecked();
});

test("AI writing settings open other-model searches on Hugging Face", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "AI writing settings" }).click();
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Local AI writing" });
  await page.evaluate(() => {
    window.open = ((
      url?: string | URL,
      target?: string,
      features?: string,
    ) => {
      Reflect.set(globalThis, "__openedHuggingFaceSearch", {
        url: String(url),
        target,
        features,
      });
      return null;
    }) as typeof window.open;
  });
  await dialog
    .getByRole("textbox", { name: "Search other GGUF models" })
    .fill("tiny llama");
  await dialog.getByRole("button", { name: "Search Hugging Face" }).click();

  const opened = await page.evaluate(() =>
    Reflect.get(globalThis, "__openedHuggingFaceSearch"),
  );
  expect(opened).toMatchObject({
    target: "_blank",
    features: "noopener,noreferrer",
  });
  const searchUrl = new URL(opened.url);
  expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe(
    "https://huggingface.co/models",
  );
  expect(searchUrl.searchParams.get("search")).toBe("tiny llama");
  expect(searchUrl.searchParams.get("pipeline_tag")).toBe("text-generation");
  expect(searchUrl.searchParams.get("library")).toBe("gguf");
  await expect(
    dialog.getByRole("list", { name: "Hugging Face GGUF model results" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("recommendations, not a restriction", { exact: false }),
  ).toBeVisible();
  await expect(dialog.getByText("No model configured yet.")).toBeVisible();
});

test("loading a GGUF does not auto-enable text suggestions", async ({
  page,
}) => {
  await useMockWllama(page);
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
  await expect(
    dialog.getByText("Choose a downloaded GGUF model below before proofreading."),
  ).toHaveCount(0);

  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "AI writing settings" }).click();
  await expect(suggestions).not.toBeChecked();
});

test("Wllama adapter serializes full-document proofreading with autocomplete", async ({
  page,
}) => {
  await useMockWllama(page);
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

    const document = [
      "# Full draft",
      "",
      "The first paragraph proves that the whole input is included.",
      "",
      "This is teh middle paragraph.",
      "",
      "- The final line must also reach the model.",
    ].join("\n");
    const instruction = "Fix spelling only; preserve every Markdown block.";
    const [proofread, suggestion] = await Promise.all([
      textSuggestService.proofread({
        document,
        instruction,
      }),
      textSuggestService.suggest(
        { prefix: "This is a" },
        { maxTokens: 24, temperature: 0.35 },
      ),
    ]);

    const loadedBeforeUnload = textSuggestService.isModelLoaded(model.id);
    const mockState = Reflect.get(globalThis, "__wllamaTest");
    const proofreadCall = mockState.chatCalls.find(
      (call: { kind: string }) => call.kind === "proofread",
    );
    await textSuggestService.unload();

    return {
      proofread,
      suggestion,
      document,
      instruction,
      proofreadPrompt: proofreadCall.messages[1].content,
      proofreadSystemPrompt: proofreadCall.messages[0].content,
      progress,
      loadedBeforeUnload,
      loadedAfterUnload: textSuggestService.isModelLoaded(model.id),
      mockState,
    };
  });

  expect(result.progress).toEqual([10, 30, 100]);
  expect(result.loadedBeforeUnload).toBe(true);
  expect(result.loadedAfterUnload).toBe(false);
  expect(result.proofread.text).toBe(result.document.replace("teh", "the"));
  expect(result.suggestion.text).toBe(" useful continuation");
  expect(result.proofreadPrompt).toContain(result.instruction);
  expect(result.proofreadPrompt).toContain(result.document);
  expect(result.proofreadPrompt).toMatch(/REVISION_INSTRUCTION_FORMSTR_BOUNDARY_/);
  expect(result.proofreadPrompt).toMatch(/END_DOCUMENT_FORMSTR_BOUNDARY_/);
  expect(result.proofreadSystemPrompt).toContain(
    "Return the complete revised document, including every unchanged part.",
  );
  expect(result.mockState.hasCacheManager).toBe(true);
  expect(result.mockState.loadCall.fileNames).toEqual(["mock.gguf"]);
  expect(result.mockState.loadCall.options).toMatchObject({
    n_ctx: 8192,
    jinja: true,
  });
  expect(result.mockState.chatCalls.map((call: { kind: string }) => call.kind)).toEqual([
    "proofread",
    "suggestion",
  ]);
  expect(result.mockState.maxActiveGenerations).toBe(1);
  expect(result.mockState.exitCalls).toBe(1);
});

test("proofreading protects embeds and refuses unsafe context sizes", async ({
  page,
}) => {
  await useMockWllama(page);
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const modulePath = "/src/lib/textSuggest/wllamaService.ts";
    const { textSuggestService } = await import(modulePath);
    const model = { id: "custom:e2e-safety", label: "safety.gguf" };
    await textSuggestService.ensureLoadedFromFile(
      new File(["fake GGUF"], "safety.gguf"),
      model,
    );

    const embed =
      '<encrypted-file data-src="https://files.test/blob" data-key="secret-key" data-nonce="nonce"></encrypted-file>';
    const document = `Before\n\n${embed}\n\nThis is teh ending.`;
    const proofread = await textSuggestService.proofread({
      document,
      instruction: "Fix spelling only.",
    });
    const proofreadCall = Reflect.get(globalThis, "__wllamaTest").chatCalls.find(
      (call: { kind: string }) => call.kind === "proofread",
    );

    let contextError = "";
    try {
      await textSuggestService.proofread({
        document: "界".repeat(1_800),
        instruction: "Fix spelling only.",
      });
    } catch (error) {
      contextError = error instanceof Error ? error.message : String(error);
    }

    let instructionError = "";
    try {
      await textSuggestService.proofread({
        document: "Short document.",
        instruction: "x".repeat(501),
      });
    } catch (error) {
      instructionError = error instanceof Error ? error.message : String(error);
    }

    const callCount = Reflect.get(globalThis, "__wllamaTest").chatCalls.length;
    await textSuggestService.unload();
    return {
      embed,
      proofread,
      rawPrompt: proofreadCall.messages[1].content,
      contextError,
      instructionError,
      callCount,
    };
  });

  expect(result.proofread.text).toContain(result.embed);
  expect(result.proofread.text).toContain("This is the ending.");
  expect(result.rawPrompt).not.toContain("secret-key");
  expect(result.rawPrompt).toContain("FORMSTR_PROTECTED_EMBED_");
  expect(result.contextError).toContain("too long for the loaded model context");
  expect(result.instructionError).toContain("under 500 characters");
  expect(result.callCount).toBe(1);
});

test("proofreading diff can be rejected unchanged and then accepted", async ({
  page,
}) => {
  await useMockWllama(page);
  await page.goto("/");

  const original = "This is teh complete draft.";
  const revised = "This is the complete draft.";
  const instructionText = "Fix the spelling error without changing anything else.";
  const editor = page.locator(".tiptap").first();
  await editor.click();
  await page.keyboard.type(original);

  const openProofreader = async () => {
    await page.getByRole("button", { name: "AI writing settings" }).click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "Local AI writing" });
    await dialog
      .getByRole("textbox", { name: "What should the proofreader do?" })
      .fill(instructionText);
    return dialog;
  };

  const firstDialog = await openProofreader();
  await firstDialog.locator('input[type="file"]').setInputFiles({
    name: "proofreader.gguf",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("fake GGUF"),
  });
  await expect(firstDialog.getByText("proofreader.gguf", { exact: true })).toBeVisible();
  await expect(
    firstDialog.getByRole("switch", { name: "Enable text suggestions" }),
  ).not.toBeChecked();
  await page.evaluate(() => {
    Reflect.get(globalThis, "__wllamaTest").generationDelayMs = 600;
  });
  await firstDialog.getByRole("button", { name: "Review changes" }).click();

  await expect(
    firstDialog.getByRole("button", { name: "Proofreading locally…" }),
  ).toBeVisible();
  const orbit = firstDialog.getByTestId("proofread-border-orbit");
  await expect(orbit).toBeVisible();
  expect(
    await orbit.evaluate((element) => getComputedStyle(element).animationName),
  ).toContain("proofread-border-orbit");

  const changes = page.getByLabel("Proofreading changes");
  await expect(changes).toBeVisible();
  await expect(changes.getByText("Review AI changes")).toBeFocused();
  const diff = changes.getByLabel("Document diff");
  await expect(diff.locator("del")).toContainText("teh");
  await expect(diff.locator("ins")).toContainText("the");

  await changes.getByRole("button", { name: "Reject" }).click();
  await expect(changes).toBeHidden();
  await expect(editor).toHaveText(original);

  const secondDialog = await openProofreader();
  await secondDialog.getByRole("button", { name: "Review changes" }).click();
  await expect(changes).toBeVisible();
  await changes.getByRole("button", { name: "Accept changes" }).click();

  await expect(changes).toBeHidden();
  await expect(editor).toHaveText(revised);
  await expect(editor).not.toContainText("teh");

  // The accepted rewrite is one standalone history item. A following edit
  // must undo separately, then one more Undo restores the reviewed original.
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Extra");
  await expect(editor).toHaveText(`${revised} Extra`);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toHaveText(revised);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).toHaveText(original);

  const proofreadPrompts = await page.evaluate(() => {
    const state = Reflect.get(globalThis, "__wllamaTest");
    return state.chatCalls
      .filter((call: { kind: string }) => call.kind === "proofread")
      .map((call: { messages: Array<{ content: string }> }) =>
        call.messages[1].content,
      );
  });
  expect(proofreadPrompts).toHaveLength(2);
  for (const prompt of proofreadPrompts) {
    expect(prompt).toContain(instructionText);
    expect(prompt).toContain(original);
    expect(prompt).toMatch(/REVISION_INSTRUCTION_FORMSTR_BOUNDARY_/);
    expect(prompt).toMatch(/END_DOCUMENT_FORMSTR_BOUNDARY_/);
  }
});

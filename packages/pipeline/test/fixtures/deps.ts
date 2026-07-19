// Збірка PipelineDeps для офлайн-тестів: спільний FakeModelFactory (calls персистять між start/resume),
// MemorySaver-checkpointer, фейкові web search / image store.
import { MemorySaver } from "@langchain/langgraph";
import type { PipelineDeps } from "../../src/ports";
import { FakeModelFactory, fakeImageStore, fakeWebSearch, type Responder } from "./fakeModel";

export function makeDeps(responses: Partial<Record<string, Responder>>): {
  deps: PipelineDeps;
  fake: FakeModelFactory;
} {
  // Один інстанс фейку на прогін → calls акумулюються через start + resume (для asserts).
  const fake = new FakeModelFactory(responses as never);
  const deps: PipelineDeps = {
    models: () => fake,
    webSearch: fakeWebSearch,
    imageStore: fakeImageStore,
    checkpointer: new MemorySaver(),
  };
  return { deps, fake };
}

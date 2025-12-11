// Re-export the topic context hook so it can be used in frontend-base
// This is a stub that will be overridden when inside a TopicProvider

let topicContextHook: (() => any | null) | null = null;

export function setTopicContextHook(hook: () => any | null) {
  topicContextHook = hook;
}

export function useTopicContext() {
  if (topicContextHook) {
    return topicContextHook();
  }
  return null;
}

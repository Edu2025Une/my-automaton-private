/**
 * Parent-Child Messaging
 *
 * Remote parent-child messaging is unavailable in standalone mode because
 * the legacy Conway social relay has been removed.
 */

export async function sendToChild(
  _childAddress: string,
  _content: string,
  _type: string = "parent_message",
): Promise<{ id: string }> {
  throw new Error("Parent-child remote messaging is unavailable in standalone runtime.");
}

export async function sendToParent(
  _parentAddress: string,
  _content: string,
  _type: string = "child_message",
): Promise<{ id: string }> {
  throw new Error("Parent-child remote messaging is unavailable in standalone runtime.");
}

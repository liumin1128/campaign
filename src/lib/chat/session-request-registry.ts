export interface SessionRequestToken {
  id: string;
  sessionId: string;
  controller: AbortController;
}

export class SessionRequestRegistry {
  private readonly requests = new Map<string, SessionRequestToken>();

  begin(sessionId: string): SessionRequestToken | null {
    if (this.requests.has(sessionId)) return null;

    const token: SessionRequestToken = {
      id: crypto.randomUUID(),
      sessionId,
      controller: new AbortController(),
    };
    this.requests.set(sessionId, token);
    return token;
  }

  has(sessionId: string | null | undefined): boolean {
    return !!sessionId && this.requests.has(sessionId);
  }

  finish(token: SessionRequestToken): boolean {
    if (this.requests.get(token.sessionId)?.id !== token.id) return false;
    this.requests.delete(token.sessionId);
    return true;
  }

  abort(sessionId: string): boolean {
    const token = this.requests.get(sessionId);
    if (!token) return false;
    token.controller.abort();
    return true;
  }

  cancel(sessionId: string): boolean {
    const token = this.requests.get(sessionId);
    if (!token) return false;
    token.controller.abort();
    this.requests.delete(sessionId);
    return true;
  }

  abortAll(): void {
    for (const token of this.requests.values()) token.controller.abort();
    this.requests.clear();
  }

  activeSessionIds(): string[] {
    return [...this.requests.keys()];
  }
}

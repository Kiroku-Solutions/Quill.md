export interface CollabConfig {
	/** Enable real-time collaboration (default: false). */
	enabled: boolean;
	/** Hocuspocus server WebSocket URL (e.g. 'wss://collab.myteam.com'). */
	serverUrl: string;
	/** Optional token for authentication. */
	token?: string;
	/** Display name for presence (overrides provider user name). */
	displayName?: string;
}

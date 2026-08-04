const params = new URLSearchParams(window.location.search);

export const isActivity = params.has("frame_id");

let sdkPromise = null;

export function getDiscordSdk(clientId) {
    if (!isActivity) return Promise.resolve(null);
    if (!sdkPromise) {
        sdkPromise = import("/shared/vendor/embedded-app-sdk/index.mjs")
            .then(async ({ DiscordSDK }) => {
                const sdk = new DiscordSDK(clientId);
                await sdk.ready();
                return sdk;
            });
    }
    return sdkPromise;
}

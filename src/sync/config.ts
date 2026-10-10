// Google Cloud project "Expense Tracker" (separate from the donation tracker's project).
// None of these are secrets: they identify the app to Google and are restricted in the Cloud Console.
// The app uses the browser sign-in flow, so there is no client secret anywhere.

/** OAuth 2.0 Client ID (Web application). */
export const CLIENT_ID = ''
/** Project number. The file picker needs it to grant this app access to a picked file. */
export const APP_ID = ''
/** Browser API key, restricted to the github.io / localhost referrers and the Google Picker API. */
export const PICKER_API_KEY = ''

/** False until the Google Cloud values above are filled in. */
export const syncConfigured = () => !!CLIENT_ID && !!APP_ID

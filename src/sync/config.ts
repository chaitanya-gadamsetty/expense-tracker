// Google Cloud project "Expense Tracker" (separate from the donation tracker's project).
// None of these are secrets: they identify the app to Google and are restricted in the Cloud Console.
// The app uses the browser sign-in flow, so there is no client secret anywhere.

/** OAuth 2.0 Client ID (Web application). */
export const CLIENT_ID = '778162195305-pcbhhq0tdtpl4qmo7j9f17tvpsf701j4.apps.googleusercontent.com'
/** Project number. The file picker needs it to grant this app access to a picked file. */
export const APP_ID = '778162195305'
/** Browser API key, restricted to the github.io / localhost referrers and the Google Picker API. */
export const PICKER_API_KEY = 'AIzaSyDRWqV1xEqBav8YflJ24RFATetflvF4OyQ'

/** False until the Google Cloud values above are filled in. */
export const syncConfigured = () => !!CLIENT_ID && !!APP_ID

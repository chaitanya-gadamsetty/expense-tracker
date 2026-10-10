// Google Cloud project shared with the donation tracker (same OAuth client, same consent screen).
export const CLIENT_ID = '99253073247-2ulvegjnh39aou0h8589lnq1cg3ecsjf.apps.googleusercontent.com'
/** Project number (the first part of the client ID). The file picker needs it to grant this app access. */
export const APP_ID = '99253073247'
/**
 * Browser API key for the Google Picker. Public by design; restrict it in Google Cloud to
 * HTTP referrers https://chaitanya-gadamsetty.github.io/* (and localhost) and to the Picker API.
 */
export const PICKER_API_KEY = ''

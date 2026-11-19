# Set up ETS (plain steps)

You can use ETS right away. It saves in the browser. Google is only needed if you want the same list on your work computer and your phone, stored in your own Google Sheet.

The website is public. Your data is not. Do not put patient information in ETS.

## 1. Turn on GitHub Pages

1. Open the GitHub repository: https://github.com/engot143-oss/ets-tracker
2. Click **Settings**.
3. In the left menu, click **Pages**.
4. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**
5. Click **Save**.
6. Wait a minute, then open: https://engot143-oss.github.io/ets-tracker/

If the page is blank, wait a bit and refresh. GitHub sometimes needs a few minutes the first time.

## 2. Create a free Google sign-in (so ETS can use your Sheet)

Do this on a computer while signed into the Gmail account that should own the sheet.

### Create a Google Cloud project

1. Open https://console.cloud.google.com/
2. Sign in with your Gmail.
3. At the top, open the project menu and click **New Project**.
4. Name it `ETS` and click **Create**.
5. Make sure the new **ETS** project is selected at the top.

### Set the consent screen (who is allowed to sign in)

This is Google’s permission screen. You are the only user.

1. Open https://console.cloud.google.com/apis/credentials/consent
2. If Google asks for a Google Auth Platform / OAuth overview, continue until you can choose **Get started** or **Configure consent screen**.
3. User type: **External**.
4. App name: `ETS`
5. User support email: your Gmail.
6. Developer contact email: your Gmail.
7. Finish / save. You can skip optional logo and domain fields.
8. Publishing status should stay **Testing**.
9. Open **Audience** (or **Test users**) and add **your own Gmail** as a test user.

If Google shows a warning that the app is not verified, that is normal for a personal app. You will click Continue when you sign in.

### Turn on the two APIs ETS needs

1. Open https://console.cloud.google.com/apis/library
2. Search for **Google Sheets API** → click it → click **Enable**.
3. Search for **Google Drive API** → click it → click **Enable**.

### Create the Client ID

1. Open https://console.cloud.google.com/apis/credentials
2. Click **Create credentials** → **OAuth client ID**.
3. If it asks you to complete the consent screen first, go back and finish that, then return here.
4. Application type: **Web application**.
5. Name: `ETS web`
6. Under **Authorized JavaScript origins**, click **Add URI** and enter:

   `https://engot143-oss.github.io`

   Do not add a slash at the end. Do not add the `/ets-tracker` path here.

7. You can leave **Authorized redirect URIs** empty.
8. Click **Create**.
9. Copy the **Client ID**. It looks like `1234567890-abc.apps.googleusercontent.com`.
   You do not need the Client Secret.

## 3. Paste the Client ID into the site

1. In the GitHub repository, open the file `config.js`.
2. Click the pencil (Edit this file).
3. Find this line:

   `googleClientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",`

4. Replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with the Client ID you copied. Keep the quotes.
5. Commit the change on **main** (or merge the pull request if you are editing on a branch).
6. Wait a minute for Pages to update, then refresh ETS.

## 4. Test on your work browser and iPhone

1. Open https://engot143-oss.github.io/ets-tracker/
2. You should see a **Sign in with Google** button.
3. Sign in with the same Gmail you added as a test user.
4. Allow access to Sheets / Drive files created by ETS.
5. ETS will create or find a Google Sheet named **ETS Data** with tabs **Inventory** and **Missing**.
6. Add a slot, then confirm the header status changes to **Saved**.
7. On your iPhone Safari, open the same site, sign in with the same Google account, and confirm the row appears.

If Google is blocked at work, keep using the browser save, plus **Export JSON**. Your typed rows are not thrown away if Google save fails. The status will say **Error** or **Offline**, and you can try again later.

### If sign-in fails

- Confirm the JavaScript origin is exactly `https://engot143-oss.github.io`
- Confirm your Gmail is a test user
- Confirm Sheets API and Drive API are enabled
- Confirm `config.js` on `main` has your Client ID, not the placeholder
- Try a private/incognito window after adding the test user

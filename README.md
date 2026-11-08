# BloodLink

A mobile-responsive blood donation and emergency request app built with plain HTML, CSS, and JavaScript. It uses Firebase Realtime Database and Firebase Authentication when configured, and otherwise runs as a browser-local demo with data stored in `localStorage`.

## Run locally

Serve this folder over HTTP and open its root URL (for example, `python -m http.server 8000`). In-app navigation uses hash routes (such as `/#/admin`) so page reloads work on simple static servers without SPA rewrite support. The local demo supports requests, donor applications, blog content, and an admin dashboard; demo data stays in the current browser. The demo is for preview only and does not provide production authentication or data security.

## Connect and deploy Firebase

1. Create a Firebase project, register a Web app, and create a Realtime Database.
2. Enable **Authentication → Email/Password** and create the account(s) that should have admin access.
3. Add the web app configuration to `firebase-config.js`.
4. In **Authentication → Users**, copy the UID for each administrator account. In **Realtime Database → Data**, add each UID under `/admins` with the boolean value `true` (for example, `/admins/PASTE_USER_UID_HERE: true`). Do not grant admin access to accounts that should not manage donor and request data.
5. Select your Firebase project with `firebase use PROJECT_ID`, then deploy the configured Hosting rewrites and Realtime Database rules:

   ```sh
   firebase deploy --only database,hosting
   ```

After adding the UID and deploying the rules, sign in at `/#/admin` using that Firebase Authentication account. The app checks the signed-in user's UID against `/admins`; each user can read only their own admin entry, and clients cannot edit admin entries.

`firebase.json` points to `database.rules.json`. Public users can read blood requests and blog posts and submit requests and donor applications. Only authenticated users listed under `/admins` can read donor records or applications, approve donors, update request status, or manage blog posts. The donor rules are enforced in Realtime Database, not just by hiding the directory in the UI.

Legacy direct paths such as `/request-blood` and `/admin` are also handled by the Firebase Hosting single-page-app rewrite.

## Data and privacy

Public visitors can register as donors, but cannot browse the donor directory; `/donors` redirects to donor registration. Donor contact details and donor applications are visible only to authorized admins. Configure your Firebase project, rules, retention practices, and privacy notice for the region and organization operating the service. Collect donor contact details only with informed consent. BloodLink is not an emergency service or a substitute for clinical advice.

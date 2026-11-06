# UniPark AI

UniPark AI is a mobile-first campus parking prototype. Its interface is in English and uses local sample data so a class presentation can cover student registration, admin review, simulated camera entry, and guarded vehicle exit.

## Run the prototype

There are no packages to install and no build step. From the project folder, start a local web server:

```powershell
py -m http.server 5173
```

Open <http://localhost:5173>. You can also open `index.html` directly; use the local server when trying the optional camera scanner because browsers restrict camera access on ordinary file pages.

## Demo sign-in

Choose the matching role on the sign-in screen. New students can select **Create an account**, provide their name, student ID, university email, and password, then continue to vehicle verification. After submitting the vehicle form, the profile appears in the admin review queue. Returning students sign in with the email and password they created.

The seeded student accounts (`jordan.lee@northstar.edu` and `taylor.reed@northstar.edu`) both use `student123`.

| Role | Email | Password |
| --- | --- | --- |
| Student | `jordan.lee@northstar.edu` or `taylor.reed@northstar.edu` | `student123` |
| Security Guard | `guard@unipark.edu` | `guard123` |
| School Admin | `admin@unipark.edu` | `admin123` |

This is front-end-only demo authentication, not a real identity system. New student password hashes and profiles live only in this browser's local storage. Admin and security access use the fixed demo credentials above. Sign out to change roles.

## Demo walkthrough

Use **Sign out** to return to the login screen and choose another role. Changes are saved in this browser's local storage. **Reset demo** restores the original sample state.

### Register and approve a vehicle

1. Choose **Taylor Reed · Student** and open **Vehicle verification**.
2. Fill in the three sample image controls with dummy images. The files are not uploaded or retained; only their file names are recorded when the form is submitted.
3. Submit the profile. Taylor appears as pending in the admin queue.
4. Switch to **School Admin · Demo**, choose **Students & vehicles**, and approve the pending profile.

The seeded Taylor profile is already pending, so you can skip steps 1–3 when time is short.

### Check a vehicle in

1. Choose **Jordan Lee · Student**. Jordan's sample vehicle is approved and outside campus.
2. Keep the detected plate as `51A-248.36` and select **Confirm vehicle entry**.
3. The vehicle changes to **Parked on campus** and a random, short-lived QR exit pass appears. An incorrect plate is rejected and logged.

### Check out successfully

1. Copy the current QR token from Jordan's student dashboard.
2. Switch to **Security Guard · Demo**, paste the token, and enter `51A-248.36` as the camera plate.
3. Select **Verify & check out**. A successful check-out consumes the token and changes the vehicle to **Outside campus**.

### Try rejected check-outs

On the security screen, load and submit **Expired QR token** or **Previously used QR** to see those rejection reasons. To try **Plate mismatch**, first check Jordan's vehicle in, then load the mismatch scenario and submit it. Failed attempts appear in both the guard view and admin activity log.

## Prototype logic

- `app.js` contains the student, review, QR-token, check-in/check-out, camera-scanner, filtering, and CSV-export logic.
- `styles.css` provides the responsive mobile-first layout; `index.html` is the app entry point.
- QR passes are real offline QR images containing only random tokens. The optional guard camera scanner uses the browser's `BarcodeDetector` API when available; manual token entry is the fallback.
- A token expires after three minutes and succeeds only once. Check-out also requires an approved profile, a vehicle currently parked on campus, and a matching normalized plate.
- Document selection is simulated. The browser does not upload the file contents; the demo stores file names with profile state in local storage.

## Before using this as a real system

This prototype has no backend, real authentication, or server-side authorization. Browser local storage can be edited by its user and is not suitable for production or sensitive records. Replace the demo with:

- A backend with secure authentication, role-based authorization, and server-side validation.
- Encrypted document storage, access controls, audit logs, and a documented retention/deletion policy.
- Server-issued signed QR tokens with expiry, replay protection, and server-side verification.
- A real camera/ANPR integration with confidence thresholds and a human exception process.
- Production monitoring, incident handling, and privacy/security review.

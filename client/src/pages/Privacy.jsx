import { Link } from 'react-router-dom';

export default function Privacy() {
  return (
    <div className="shell">
      <main className="shell-main" style={{ maxWidth: 780 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <Link className="btn btn-secondary btn-sm" to="/login">
            ← Back
          </Link>
        </div>

        <h1>Privacy notice</h1>
        <p className="muted small" style={{ marginBottom: 18 }}>
          CampusCheck is used by your university to record lecture attendance. This notice explains what is collected,
          why, how long it is kept, and who can see it.
        </p>

        <div className="stack">
          <section className="card">
            <h2>What we collect</h2>
            <ul className="small">
              <li>Your name, university email, matric or staff number, programme, level and department.</li>
              <li>The courses you are enrolled in.</li>
              <li>Attendance: status (present, late, absent, excused), time of check-in, and whether you used a QR scan or a six-digit code.</li>
              <li>A device identifier: a random value created by your browser, stored only as a one-way hash so that we can detect one phone being used to check in several students.</li>
              <li>For sessions where your lecturer enables venue verification: a distance in metres between your phone and the classroom.</li>
            </ul>
          </section>

          <section className="card">
            <h2>What we do not collect</h2>
            <ul className="small">
              <li>No raw GPS coordinates or location history. Only the distance required for the verification of that one check-in is stored.</li>
              <li>No contacts, photos, microphone, biometrics or background location.</li>
              <li>No advertising or third-party tracking.</li>
            </ul>
          </section>

          <section className="card">
            <h2>Why we use it</h2>
            <ul className="small">
              <li>To record who attended a lecture, and to show you your own attendance percentage.</li>
              <li>To let lecturers correct mistakes with a reason attached.</li>
              <li>To produce attendance reports for your department and the university.</li>
              <li>To detect fraudulent check-ins (shared codes, shared devices, check-ins from outside the venue).</li>
            </ul>
          </section>

          <section className="card">
            <h2>How long we keep it</h2>
            <p className="small">
              Attendance records are kept for the retention period set by your institution (365 days by default) and
              then deleted. Location-verification fields are removed on the same schedule. Correction history (who
              changed a record, when, and why) is kept for 24 months so that changes remain provable.
            </p>
          </section>

          <section className="card">
            <h2>Who can see it</h2>
            <ul className="small">
              <li>You can see your own attendance and no one else's.</li>
              <li>A lecturer can see attendance for their own courses only.</li>
              <li>Administrators can see all records for reporting and support.</li>
              <li>Nobody outside the university can access the data.</li>
            </ul>
          </section>

          <section className="card">
            <h2>Your choices</h2>
            <ul className="small">
              <li>Location permission is requested only when a session verifies your venue, and you can refuse it — you would then check in through your lecturer instead.</li>
              <li>You can ask your department office to correct an attendance record; lecturers record a reason for every correction.</li>
              <li>Questions about your data can go to your institution's data protection officer.</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

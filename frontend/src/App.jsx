import React, { useState } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Child Components ---

const Header = () => (
    <header className="header">
        <div className="header-content">
            <h1>PRESCRIPTION ANALYZER</h1>
        </div>
    </header>
);

const Spinner = () => (
    <div className="spinner-overlay">
        <div className="spinner"></div>
    </div>
);

const InfoPanel = ({ hospitalDetails, prescriptionInfo, isLoading }) => {
    const currentDateTime = new Date().toLocaleString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata'
    });

    return (
        <div className="panel api-panel">
            <h2 className="panel-title">Prescription Details</h2>
            <div className="response-content-wrapper" style={{ padding: '0.5rem' }}>
                {isLoading && <Spinner />}
                {!isLoading && (hospitalDetails.name || prescriptionInfo.doctor_name || prescriptionInfo.patient_name || prescriptionInfo.date) ? (
                    <>
                        <div className="info-section">
                            <h3>Hospital/Clinic</h3>
                            <p><strong>Name:</strong> {hospitalDetails.name || 'N/A'}</p>
                            <p><strong>Address:</strong> {hospitalDetails.address || 'N/A'}</p>
                            <p><strong>Contact:</strong> {hospitalDetails.phone || 'N/A'}</p>
                        </div>
                        <div className="info-section">
                            <h3>Doctor</h3>
                            <p><strong>Name:</strong> {prescriptionInfo.doctor_name || 'N/A'}</p>
                            <p><strong>Registration No:</strong> {prescriptionInfo.doctor_reg_no || 'N/A'}</p>
                            <p><strong>Contact:</strong> {prescriptionInfo.doctor_contact || 'N/A'}</p>
                        </div>
                        <div className="info-section">
                            <h3>Patient</h3>
                            <p><strong>Name:</strong> {prescriptionInfo.patient_name || 'N/A'}</p>
                            <p><strong>Age:</strong> {prescriptionInfo.patient_age || 'N/A'}</p>
                            <p><strong>Gender:</strong> {prescriptionInfo.patient_gender || 'N/A'}</p>
                        </div>
                        <div className="info-section">
                            <h3>Prescription Date</h3>
                            <p>{prescriptionInfo.date || 'N/A'}</p>
                        </div>
                        <div className="info-section">
                            <h3>Analysis Time</h3>
                            <p>{currentDateTime}</p>
                        </div>
                    </>
                ) : (
                    !isLoading && <p>Upload an image to see prescription details here.</p>
                )}
            </div>
        </div>
    );
};

const ConfigPanel = ({ handleFileChange, fileName, handleAnalyzeClick, isLoading }) => (
    <div className="panel config-panel">
        <h2 className="panel-title">Upload Prescription</h2>
        <div className="config-content">
            <input type="file" accept="image/*" onChange={handleFileChange} className="file-input" />
            {fileName && <p className="file-name">Selected: {fileName}</p>}
            <button onClick={handleAnalyzeClick} disabled={isLoading || !fileName} className="analyze-button">
                {isLoading ? 'Analyzing...' : 'Analyze Prescription'}
            </button>
            <p className="note">Note: Only image files are supported.</p>
        </div>
    </div>
);

// --- MedicationsPanel includes price ---
const MedicationsPanel = ({ medications, generatePdf, isLoading, handleSetReminder }) => (
    <div className="panel response-panel">
        <h2 className="panel-title">Medications</h2>
        <div className="response-content-wrapper">
            {isLoading && <Spinner />}
            {!isLoading && medications.length > 0 ? (
                <>
                    <button onClick={generatePdf} className="pdf-button">Generate PDF Report</button>
                    <div className="medication-list">
                        {medications.map((med, index) => (
                            <div key={index} className="medication-item">
                                <h3>
                                    {med.tablet_name || 'N/A'}
                                    <span className="source-info">(Conf: {med.confidence_details?.tablet_name || 'N/A'})</span>
                                </h3>
                                <p><strong>Dosage:</strong> {med.instructions?.dosage || 'N/A'} <span className="source-info">({med.source_details?.dosage || 'N/A'}, Conf: {med.confidence_details?.dosage || 'N/A'})</span></p>
                                <p><strong>Frequency:</strong> {med.instructions?.frequency || 'N/A'} <span className="source-info">({med.source_details?.frequency || 'N/A'}, Conf: {med.confidence_details?.frequency || 'N/A'})</span></p>
                                <p><strong>Duration:</strong> {med.instructions?.duration || 'N/A'} <span className="source-info">({med.source_details?.duration || 'N/A'}, Conf: {med.confidence_details?.duration || 'N/A'})</span></p>
                                <p><strong>Timing:</strong> {med.instructions?.timing || 'N/A'} <span className="source-info">({med.source_details?.timing || 'N/A'}, Conf: {med.confidence_details?.timing || 'N/A'})</span></p>
                                {/* --- Display Price Estimate --- */}
                                <p><strong>Est. Price (India):</strong> {med.estimated_price_range_inr || 'N/A'} <span className="source-info">(General estimate)</span></p>

                                <button
                                    onClick={() => handleSetReminder(med)}
                                    className="reminder-button">
                                    Set Reminder
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                !isLoading && <p>Medication details will appear here after analysis.</p>
            )}
        </div>
    </div>
);


// --- Main App Component ---

const App = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileName, setFileName] = useState('');
    const [hospitalDetails, setHospitalDetails] = useState({});
    const [prescriptionInfo, setPrescriptionInfo] = useState({});
    const [medications, setMedications] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
            setFileName(file.name);
            setError(null);
        } else {
            setSelectedFile(null);
            setFileName('');
        }
    };

    const handleAnalyzeClick = async () => {
        if (!selectedFile) {
            setError("Please select an image file first.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setHospitalDetails({});
        setPrescriptionInfo({});
        setMedications([]);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const response = await axios.post('http://localhost:5000/api/analyze-prescription', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            console.log("API Response:", response.data);
            const data = response.data;
            setHospitalDetails(data.hospital_details || {});
            setPrescriptionInfo(data.prescription_info || {});
            setMedications(data.medications || []);
        } catch (err) {
            console.error("Error analyzing prescription:", err);
            setError(err.response?.data?.error || err.request ? "No response from server." : "An unexpected error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    // --- generatePdf includes price ---
    const generatePdf = () => {
        if (!medications || medications.length === 0) {
            alert("No medication data available to generate a report.");
            return;
        }

        const sanitizeText = (text) => {
            if (typeof text !== 'string') return 'N/A';
            return text.replace(/[^\x00-\x7F]/g, "");
        };

        try {
            const doc = new jsPDF();

            doc.setFontSize(22);
            doc.text(sanitizeText("Prescription Analysis Report"), 14, 20);

            // ... (Hospital, Doctor, Patient Details sections remain the same) ...
             doc.setFontSize(14);
            doc.text(sanitizeText("Hospital Details:"), 14, 30);
            doc.setFontSize(12);
            doc.text(sanitizeText(`Name: ${hospitalDetails.name || 'N/A'}`), 14, 37);
            doc.text(sanitizeText(`Address: ${hospitalDetails.address || 'N/A'}`), 14, 44);
            doc.text(sanitizeText(`Contact: ${hospitalDetails.phone || 'N/A'}`), 14, 51);

            doc.setFontSize(14);
            doc.text(sanitizeText("Doctor Details:"), 14, 61);
            doc.setFontSize(12);
            doc.text(sanitizeText(`Name: ${prescriptionInfo.doctor_name || 'N/A'}`), 14, 68);
            doc.text(sanitizeText(`Reg. No: ${prescriptionInfo.doctor_reg_no || 'N/A'}`), 14, 75);
            doc.text(sanitizeText(`Contact: ${prescriptionInfo.doctor_contact || 'N/A'}`), 14, 82);

            doc.setFontSize(14);
            doc.text(sanitizeText("Patient Details:"), 14, 92);
            doc.setFontSize(12);
            doc.text(sanitizeText(`Name: ${prescriptionInfo.patient_name || 'N/A'}`), 14, 99);
            doc.text(sanitizeText(`Age: ${prescriptionInfo.patient_age || 'N/A'}`), 14, 106);
            doc.text(sanitizeText(`Gender: ${prescriptionInfo.patient_gender || 'N/A'}`), 14, 113);
            doc.text(sanitizeText(`Prescription Date: ${prescriptionInfo.date || 'N/A'}`), 14, 120);


            doc.setFontSize(14);
            doc.text(sanitizeText("Medications:"), 14, 130);

            // Updated Table Columns
            const tableColumn = ["Medication", "Instructions", "Est. Price (INR)"];
            const tableRows = [];

            medications.forEach(med => {
                if (typeof med !== 'object' || med === null) return;
                const instructions = med.instructions || {};
                const instructionText = `Dosage: ${instructions.dosage || 'N/A'}\nFreq: ${instructions.frequency || 'N/A'}\nDur: ${instructions.duration || 'N/A'}\nTime: ${instructions.timing || 'N/A'}`;
                const priceText = med.estimated_price_range_inr || 'N/A'; // Get price estimate

                const medData = [
                    sanitizeText(med.tablet_name || 'N/A'),
                    sanitizeText(instructionText),
                    sanitizeText(priceText) // Add Price Column
                ];
                tableRows.push(medData);
            });

            autoTable(doc, {
                startY: 135, head: [tableColumn], body: tableRows, theme: 'striped',
                styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [20, 20, 100] },
                // Adjusted Column Widths
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { cellWidth: 65 },
                    2: { cellWidth: 55 } // Width for Price Column
                }
            });
             doc.text(sanitizeText("Note: Estimated prices are general ranges based on AI knowledge and may vary."), 14, doc.lastAutoTable.finalY + 10, { maxWidth: 180 });


            doc.save("prescription_report.pdf");
        } catch (error) {
            console.error("Failed to generate PDF:", error);
            alert("An error occurred while generating the PDF report.");
        }
    };

    const handleSetReminder = async (medication) => {
         const medicationName = medication.tablet_name || 'this medication';

        const phoneNumber = prompt(`Enter your 10-digit mobile number for "${medicationName}" reminders:`, "");
        if (!phoneNumber || !/^\d{10}$/.test(phoneNumber)) {
            if (phoneNumber) alert("Invalid phone number. Please enter a 10-digit number.");
            return;
        }

        const reminderTime = prompt(`What time should we remind you? (Use 24-hour HH:MM format, e.g., 09:00 or 21:30)`, "09:00");
        if (!reminderTime || !/^\d{2}:\d{2}$/.test(reminderTime)) {
            if (reminderTime) alert("Invalid time format. Please use HH:MM format.");
            return;
        }

        let intervalType = prompt(`Should the reminder be "daily" or "weekly"?`, "daily").toLowerCase();
        if (intervalType !== 'daily' && intervalType !== 'weekly') {
            alert("Invalid input. Please enter 'daily' or 'weekly'.");
            return;
        }

        const duration = prompt(`For how many ${intervalType === 'daily' ? 'days' : 'weeks'} should this reminder repeat?`, "7");
        if (!duration || isNaN(parseInt(duration)) || parseInt(duration) < 1) {
            if (duration) alert("Invalid duration. Please enter a positive number.");
            return;
        }

        try {
            const payload = {
                phone_number: phoneNumber,
                medication_name: medicationName,
                reminder_time: reminderTime,
                interval_type: intervalType,
                duration: parseInt(duration)
            };
            const response = await axios.post('http://localhost:5000/api/set-reminder', payload);
            alert(response.data.message);
        } catch (err) {
            console.error("Error setting reminder:", err);
            const errorMessage = err.response?.data?.error || "Failed to set reminder. Please try again.";
            alert(`Error: ${errorMessage}`);
        }
    };

    return (
        <div className="app-container">
            <Header />
            <div className="main-content">
                <ConfigPanel
                    handleFileChange={handleFileChange}
                    fileName={fileName}
                    handleAnalyzeClick={handleAnalyzeClick}
                    isLoading={isLoading}
                />
                <InfoPanel
                    hospitalDetails={hospitalDetails}
                    prescriptionInfo={prescriptionInfo}
                    isLoading={isLoading}
                />
                <MedicationsPanel
                    medications={medications}
                    generatePdf={generatePdf}
                    isLoading={isLoading}
                    handleSetReminder={handleSetReminder}
                />
            </div>
            {error && <div className="error-message">{error}</div>}
            <AppStyles />
        </div>
    );
};

// --- Styles Component ---
const AppStyles = () => (
    <style>{`
      :root {
          --bg-color: #f3f4f6;
          --panel-bg-color: #ffffff;
          --border-color: #e5e7eb;
          --primary-indigo: #4f46e5;
          --primary-indigo-dark: #4338ca;
          --text-color-dark: #1f2937;
          --text-color-light: #6b7280;
          --shadow-light: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
          --shadow-medium: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          --success-green: #10b981;
          --success-green-dark: #059669;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', sans-serif; background-color: var(--bg-color); color: var(--text-color-dark); line-height: 1.6; overflow: hidden; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
      .app-container { background-color: var(--panel-bg-color); border-radius: 0.75rem; box-shadow: var(--shadow-medium); padding: 2rem; width: 100%; max-width: 1200px; display: flex; flex-direction: column; gap: 1.5rem; max-height: 95vh; overflow: hidden; }
      .header { background-color: var(--primary-indigo); color: #ffffff; padding: 1rem 2rem; border-radius: 0.5rem; text-align: center; box-shadow: var(--shadow-light); }
      .header-content h1 { font-size: 2rem; margin: 0; }
      .main-content { display: flex; gap: 1.5rem; flex-grow: 1; overflow: hidden; }
      .panel { background-color: var(--panel-bg-color); border: 1px solid var(--border-color); border-radius: 0.5rem; box-shadow: var(--shadow-light); padding: 1.5rem; display: flex; flex-direction: column; flex: 1; min-width: 300px; overflow: hidden; }
      .api-panel { flex: 1.2; }
      .config-panel { flex: 0.8; }
      .response-panel { flex: 2; }
      .panel-title { font-size: 1.25rem; color: var(--primary-indigo-dark); margin-bottom: 1rem; border-bottom: 2px solid var(--border-color); padding-bottom: 0.5rem; }
      .config-content { display: flex; flex-direction: column; gap: 1rem; flex-grow: 1; }
      .file-input { padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background-color: #f9fafb; cursor: pointer; }
      .file-input::file-selector-button { background-color: var(--primary-indigo); color: white; padding: 0.5rem 1rem; border: none; border-radius: 0.25rem; cursor: pointer; margin-right: 1rem; transition: background-color 0.2s ease; }
      .file-input::file-selector-button:hover { background-color: var(--primary-indigo-dark); }
      .file-name { font-size: 0.9rem; color: var(--text-color-light); word-break: break-all;}
      .analyze-button, .pdf-button { background-color: var(--primary-indigo); color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 1rem; transition: background-color 0.2s ease, transform 0.1s ease; width: 100%;}
      .analyze-button:hover, .pdf-button:hover { background-color: var(--primary-indigo-dark); transform: translateY(-1px); }
      .analyze-button:disabled, .pdf-button:disabled { background-color: #a5b4fc; cursor: not-allowed; transform: none;}
      .note { font-size: 0.8rem; color: var(--text-color-light); margin-top: 0.5rem; text-align: center; }
      .response-content-wrapper { flex-grow: 1; overflow-y: auto; padding-right: 0.5rem; }
      .medication-list { display: flex; flex-direction: column; gap: 1rem; }
      .medication-item { background-color: #f9fafb; border: 1px solid var(--border-color); border-radius: 0.375rem; padding: 1rem; box-shadow: var(--shadow-light); }
      .medication-item h3 { font-size: 1.1rem; color: var(--primary-indigo-dark); margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem; display: flex; justify-content: space-between; align-items: center; }
      .medication-item p { font-size: 0.9rem; margin: 0.25rem 0; }
      .medication-item strong { color: var(--text-color-dark); }
      .source-info { font-size: 0.75rem; color: var(--text-color-light); margin-left: 0.5rem; white-space: nowrap; }
      .error-message { background-color: #fee2e2; color: #ef4444; padding: 1rem; border-radius: 0.5rem; border: 1px solid #fca5a5; text-align: center; font-weight: bold; margin-top: 1rem; flex-shrink: 0;}
      .spinner-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(255, 255, 255, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10; border-radius: 0.5rem; }
      .spinner { border: 4px solid rgba(128, 90, 213, 0.2); border-top: 4px solid var(--primary-indigo); border-radius: 50%; animation: spin 1s linear infinite; width: 40px; height: 40px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .info-section h3 { font-size: 1rem; color: #1f2937; margin-top: 0.5rem; margin-bottom: 0.5rem; border-bottom: 1px dashed var(--border-color); padding-bottom: 0.25rem; }
      .info-section p { margin: 0.25rem 0; font-size: 0.9rem; }
      .info-section strong { color: #111827; }
      .reminder-button { background-color: var(--success-green); color: white; padding: 0.5rem 1rem; border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem; margin-top: 0.75rem; transition: background-color 0.2s ease, transform 0.1s ease; }
      .reminder-button:hover { background-color: var(--success-green-dark); transform: translateY(-1px); }

       @media (max-width: 1024px) {
        body { overflow: auto; }
        .app-container { height: auto; padding: 1.5rem; max-height: none; }
        .main-content { flex-wrap: wrap; flex-direction: column; overflow-x: hidden; overflow-y: auto; padding-bottom: 0;}
        .panel { width: 100%; margin-bottom: 1.5rem; flex-basis: auto; flex-shrink: 1;}
       }

      @media (max-width: 768px) {
        body { padding: 0.5rem; }
        .app-container { padding: 1rem; }
         .main-content { align-items: stretch; }
        .panel { max-width: none; }
        .header-content h1 { font-size: 1.5rem; }
      }
    `}</style>
);

export default App;


import os
import re
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai
import google.api_core.exceptions

# --- Imports for direct image handling ---
from PIL import Image
import io

# --- Twilio and Scheduler Imports ---
from twilio.rest import Client
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

# Load environment variables
load_dotenv()

# --- Configure Twilio ---
twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID")
twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
twilio_phone_number = os.getenv("TWILIO_PHONE_NUMBER")
twilio_client = Client(twilio_account_sid, twilio_auth_token)

# --- Initialize Scheduler ---
scheduler = BackgroundScheduler(daemon=True, timezone='Asia/Kolkata')
scheduler.start()

# --- Configure the Gemini API ---
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("GEMINI_API_KEY not found in the .env file.")
genai.configure(api_key=api_key)

# --- Initialize Flask App ---
app = Flask(__name__)
CORS(app)

# --- Reminder Sending Function ---
def send_sms_reminder(recipient_phone_number, medication_name):
    """Sends an SMS using Twilio."""
    try:
        message_body = f"Reminder: It's time to take your medication - {medication_name}."
        message = twilio_client.messages.create(
            body=message_body,
            from_=twilio_phone_number,
            to=recipient_phone_number
        )
        print(f"SMS reminder sent successfully to {recipient_phone_number}, SID: {message.sid}")
    except Exception as e:
        print(f"Failed to send SMS to {recipient_phone_number}. Error: {e}")

# --- API Routes ---

@app.route("/")
def hello_world():
    return "Backend is running!"

@app.route("/api/analyze-prescription", methods=["POST"])
def analyze_prescription():
    if 'file' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    original_file = request.files['file']

    if not original_file.mimetype.startswith('image/'):
        return jsonify({"error": "Invalid file type. Please upload an image."}), 400

    try:
        image_bytes = original_file.read()
        img = Image.open(io.BytesIO(image_bytes))

        # --- Initialize model ---
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
             generation_config=genai.GenerationConfig(
                response_mime_type="application/json"
            )
        )

        # --- UPDATED PROMPT: Asks for estimate based on internal knowledge ---
        prompt = (
            f"Analyze this prescription image and extract the details in a strict JSON format. "
            f"Do not add any text or markdown like ```json outside of the JSON object. "
            f"The JSON structure must be exactly as follows: "
            f'{{"hospital_details": {{ "name": "", "address": "", "phone": "" }},'
            f'"prescription_info": {{ "doctor_name": "", "doctor_reg_no": "", "doctor_contact": "", "patient_name": "", "patient_age": "", "patient_gender": "", "date": "" }},'
            f'"medications": [{{"tablet_name": "","instructions": {{ "dosage": "", "frequency": "", "duration": "", "timing": "" }},'
            f'"source_details": {{ "dosage": "", "frequency": "", "duration": "", "timing": "" }},'
            f'"confidence_details": {{ "tablet_name": "", "dosage": "", "frequency": "", "duration": "", "timing": "" }},'
            f'"estimated_price_range_inr": ""}}]}} ' # Added estimated_price_range_inr
            f"INSTRUCTIONS: For all fields, extract the value from the image. If a value is not present, use 'N/A'. "
            f"DO NOT invent personal information. For medication details (dosage, frequency, etc.), if a value is MISSING, "
            f"suggest a standard clinical value and set its 'source_details' to 'AI Suggested'. Otherwise, set it to 'Prescription'. "
            f"Provide a 'confidence_details' percentage for extracted data, or 'N/A' for AI-suggested data. "
            # Updated price instruction:
            f"Based on your general knowledge, provide a very **rough estimated price range in INR** (e.g., '₹50-₹80 per strip') for each medication typically found in India, and put it in the 'estimated_price_range_inr' field. Do not use external search tools. If you don't have price information based on your training data, use 'N/A'."
        )

        # --- API CALL: Tools parameter REMOVED ---
        response = model.generate_content([prompt, img])

        cleaned_text = re.sub(r'```json\s*(.*?)\s*```', r'\1', response.text, flags=re.DOTALL)
        json_start_index = cleaned_text.find('{')
        if json_start_index != -1:
            cleaned_text = cleaned_text[json_start_index:]

        # --- DEBUG Prints ---
        print("\n--- Raw Gemini Response ---")
        print(response.text)
        print("---------------------------\n")
        print("\n--- Cleaned Text for JSON Parsing ---")
        print(cleaned_text)
        print("-------------------------------------\n")


        parsed_json = json.loads(cleaned_text)

        return jsonify(parsed_json)

    except json.JSONDecodeError as json_err:
        print(f"JSON Parsing Error: {json_err}")
        print(f"Failed on text: {cleaned_text}")
        return jsonify({"error": "Failed to parse the AI service response.", "details": str(json_err)}), 500
    except Exception as e:
        print(f"An error occurred during Gemini API call: {e}")
        print(f"Exception Type: {type(e).__name__}")
        return jsonify({"error": "An internal server error occurred while contacting the AI service.", "details": str(e)}), 500

@app.route("/api/set-reminder", methods=["POST"])
def set_reminder():
    data = request.get_json()
    if not all(k in data for k in ['phone_number', 'medication_name', 'reminder_time', 'interval_type', 'duration']):
        return jsonify({"error": "Missing required parameters for reminder."}), 400

    phone_number = data['phone_number']
    medication_name = data['medication_name']
    reminder_time = data['reminder_time']
    interval_type = data['interval_type']
    duration = data['duration']

    if not phone_number.startswith('+'):
        phone_number = '+91' + phone_number

    try:
        hour, minute = map(int, reminder_time.split(':'))
        duration_count = int(duration)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid time or duration format."}), 400

    # Calculate end_date based on interval type
    if interval_type == 'daily':
        end_date = datetime.now() + timedelta(days=duration_count)
        trigger = CronTrigger(hour=hour, minute=minute, end_date=end_date, timezone='Asia/Kolkata')
        print_msg = f"Scheduled DAILY reminder for {medication_name} to {phone_number} at {reminder_time}"
    elif interval_type == 'weekly':
        end_date = datetime.now() + timedelta(weeks=duration_count)
        day_of_week = datetime.now().weekday()  # Monday=0, Sunday=6
        trigger = CronTrigger(day_of_week=day_of_week, hour=hour, minute=minute, end_date=end_date, timezone='Asia/Kolkata')
        print_msg = f"Scheduled WEEKLY reminder for {medication_name} to {phone_number} at {reminder_time} on the same day each week"
    else:
        return jsonify({"error": "Invalid interval_type. Must be 'daily' or 'weekly'."}), 400

    # Schedule the single, dynamic job
    job_id = f"{phone_number}_{medication_name}_{interval_type}_{reminder_time}".replace(":", "")
    scheduler.add_job(
        send_sms_reminder,
        trigger=trigger,
        args=[phone_number, medication_name],
        id=job_id,
        replace_existing=True
    )
    print(print_msg)

    return jsonify({"message": f"Reminder for {medication_name} scheduled successfully!"}), 200

# --- REMOVED Route: /api/find-pharmacies ---

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)


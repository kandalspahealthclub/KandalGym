import os
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Define o caminho base como a pasta onde o server.py reside
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR)
CORS(app)

DB_FILE = os.path.join(BASE_DIR, 'database.json')

def load_db():
    if not os.path.exists(DB_FILE):
        return {"exercises": [], "teachers": [], "clients": [], "trainingPlans": {}, "mealPlans": {}, "evaluations": {}, "messages": [], "foods": [], "exerciseCategories": [], "foodCategories": [], "trainingHistory": {}, "anamnesis": {}, "qrClients": [], "admins": []}
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading DB: {e}")
        return {}

def save_db(data):
    try:
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving DB: {e}")

# API Endpoints
@app.route('/api/state', methods=['GET'])
def get_state():
    return jsonify(load_db())

@app.route('/api/state', methods=['POST'])
def update_state():
    data = request.json
    save_db(data)
    return jsonify({"status": "success"})

# Serve Static Files
@app.route('/')
def index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory(BASE_DIR, path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)

import sys

def fix_encoding(filepath):
    try:
        # Read the file
        with open(filepath, 'rb') as f:
            content = f.read()
        
        # Handle BOM if present
        if content.startswith(b'\xef\xbb\xbf'):
            content = content[3:]
            
        # Decode as UTF-8 (this gives us the "Ã­" strings)
        text = content.decode('utf-8')
        
        # Re-encode as latin-1 to get the original raw bytes
        # then decode as UTF-8 to get the correct characters.
        # errors='replace' or 'ignore' to handle cases where it's not a perfect fix
        fixed_bytes = text.encode('latin-1', errors='replace')
        fixed_text = fixed_bytes.decode('utf-8', errors='replace')
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed_text)
        print("Fixed encoding successfully.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_encoding('app.js')

import sys
import re

def find_emojis(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Find non-ascii characters
        non_ascii = re.findall(r'[^\x00-\x7F]', content)
        unique_non_ascii = sorted(list(set(non_ascii)))
        
        with open('non_ascii_report.txt', 'w', encoding='utf-8') as f:
            f.write(f"Total non-ASCII characters: {len(non_ascii)}\n")
            f.write(f"Unique non-ASCII characters: {''.join(unique_non_ascii)}\n")
            
            # Find lines with non-ascii
            f.write("\nLines with non-ASCII:\n")
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if any(ord(c) > 127 for c in line):
                    f.write(f"{i+1}: {line}\n")
        print("Report generated in non_ascii_report.txt")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    find_emojis('app.js')

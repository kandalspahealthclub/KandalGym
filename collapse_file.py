import sys

def collapse_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Check if we really have the alternating empty line pattern
    if len(lines) > 10 and all(lines[i].strip() == '' for i in range(1, 10, 2)):
        new_lines = [lines[i] for i in range(0, len(lines), 2)]
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.writelines(new_lines)
        print("File collapsed successfully.")
    else:
        print("Pattern not detected. No changes made.")

if __name__ == "__main__":
    collapse_file('app.js')

import sys

def insert_line(filepath, line_num, content):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    if 1 <= line_num <= len(lines) + 1:
        lines.insert(line_num - 1, content + '\n')
    
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(lines)
    print(f"Line inserted at {line_num} successfully.")

if __name__ == "__main__":
    insert_line('app.js', 4450, "    updateEditorDayRest(dayIdx, value) {")

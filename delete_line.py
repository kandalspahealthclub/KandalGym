import sys

def delete_line(filepath, line_num):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    if 1 <= line_num <= len(lines):
        del lines[line_num - 1]
    
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(lines)
    print(f"Line {line_num} deleted successfully.")

if __name__ == "__main__":
    delete_line('app.js', 4450)

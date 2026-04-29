import sys

def replace_emojis(filepath, line_map):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    for line_num, new_content in line_map.items():
        if 1 <= line_num <= len(lines):
            lines[line_num - 1] = new_content + '\n'
    
    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.writelines(lines)
    print("Emojis fixed.")

if __name__ == "__main__":
    replace_emojis('app.js', {
        7838: "                                    <option value=\"Semanal\">🗓️ ${this.t('pass_type_weekly')}</option>",
        7839: "                                    <option value=\"Mensal\">📅 ${this.t('pass_type_monthly')}</option>"
    })

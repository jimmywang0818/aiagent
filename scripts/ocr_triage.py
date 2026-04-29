#!/usr/bin/env python3
"""
ocr_triage.py
圖片 OCR 分類器 — 判斷圖片是否含有與保健品客服相關的問題。

用法:
    python scripts/ocr_triage.py <image_url>

輸出（stdout）:
    IGNORE          → 圖片無相關內容，忽略
    <萃取的文字>    → 有相關內容，輸出 OCR 結果供 AI 處理

依賴（擇一即可）:
    pip install easyocr        ← 優先，中文準確度高
    pip install pytesseract    ← 次選，需安裝 Tesseract 及中文包
"""

import sys
import os
import re
import urllib.request
import tempfile

# ── 相關關鍵字清單 ──────────────────────────────────
RELEVANT_KEYWORDS = [
    # 產品/成分詢問
    '成分', '功效', '怎麼吃', '幾顆', '幾包', '服用', '食用',
    '多少錢', '價格', '售價', '購買', '訂購', '下單',
    '保存', '效期', '保存期', '認證', '檢驗', '報告',
    # 訂單/物流
    '訂單', '出貨', '到貨', '運費', '退換', '退貨', '退款', '追蹤',
    # 健康/注意事項
    '過敏', '副作用', '禁忌', '孕婦', '哺乳', '兒童', '老人',
    '血糖', '血壓', '肝', '腎', '糖尿', '三高', '用藥',
    '磷', '鉀', '鈉', '鈣', '蛋白質',
    # 推薦/諮詢
    '推薦', '建議', '比較', '適合', '可以', '有沒有', '哪個',
    '達摩', '保健', '營養', '補充',
    # 問題句型
    '請問', '想問', '想知道', '有效嗎', '安全嗎', '怎麼辦',
]


def is_relevant(text: str) -> bool:
    """判斷 OCR 文字是否含相關關鍵字。"""
    t = text.lower()
    return any(kw in t for kw in RELEVANT_KEYWORDS)


def download_image(url: str) -> str:
    """下載圖片到暫存檔，回傳路徑。"""
    suffix = '.jpg'
    for ext in ['.png', '.gif', '.webp', '.jpeg']:
        if ext in url.lower():
            suffix = ext
            break
    fd, path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (compatible; LineBot-OCR/1.0)'
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        with open(path, 'wb') as f:
            f.write(resp.read())
    return path


def ocr_easyocr(image_path: str) -> str:
    """使用 EasyOCR 辨識（繁體中文 + 英文）。"""
    import easyocr
    reader = easyocr.Reader(['ch_tra', 'en'], gpu=False, verbose=False)
    results = reader.readtext(image_path, detail=0)
    return ' '.join(results)


def ocr_pytesseract(image_path: str) -> str:
    """使用 pytesseract 辨識（需安裝 tesseract + chi_tra）。"""
    import pytesseract
    from PIL import Image
    img = Image.open(image_path)
    return pytesseract.image_to_string(img, lang='chi_tra+eng')


def run_ocr(image_path: str) -> str:
    """優先 easyocr，失敗則試 pytesseract，都失敗回空字串。"""
    try:
        return ocr_easyocr(image_path)
    except ImportError:
        pass
    except Exception as e:
        print(f'[ocr] easyocr error: {e}', file=sys.stderr)

    try:
        return ocr_pytesseract(image_path)
    except ImportError:
        print('[ocr] 警告：easyocr 和 pytesseract 都未安裝', file=sys.stderr)
    except Exception as e:
        print(f'[ocr] pytesseract error: {e}', file=sys.stderr)

    return ''


def main():
    if len(sys.argv) < 2:
        print('Usage: python ocr_triage.py <image_url>', file=sys.stderr)
        print('IGNORE')
        sys.exit(0)

    url = sys.argv[1]
    image_path = None

    try:
        image_path = download_image(url)
        text = run_ocr(image_path).strip()

        if not text:
            print('IGNORE')
            return

        print(f'[ocr] extracted ({len(text)} chars): {text[:100]}', file=sys.stderr)

        if is_relevant(text):
            # 清理多餘空白後輸出
            clean = re.sub(r'\s+', ' ', text).strip()
            print(clean)
        else:
            print('IGNORE')

    except Exception as e:
        print(f'[ocr] fatal error: {e}', file=sys.stderr)
        print('IGNORE')
    finally:
        if image_path and os.path.exists(image_path):
            os.unlink(image_path)


if __name__ == '__main__':
    main()

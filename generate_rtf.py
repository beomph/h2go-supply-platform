#!/usr/bin/env python3
"""물량확인증을 RTF 형식으로 생성 (한글에서 열어 HWP로 저장 가능)"""
import os

def rtf_escape(s):
    """한글 등 유니코드를 RTF \\uN? 형식으로 변환 (signed 16-bit)"""
    result = []
    for c in s:
        code = ord(c)
        if code < 128 and c not in '\\{}':
            result.append(c)
        else:
            # RTF \uN: signed 16-bit, -32768..32767
            n = code if code <= 32767 else code - 65536
            result.append(f"\\u{n}?")
    return "".join(result)

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "H2GO_통합_물량확인증.rtf")

    # RTF 문서 내용 (한글)
    lines = [
        ("", "H2GO"),
        ("", ""),
        ("", "물량확인증"),
        ("", ""),
        ("", "입고 일자: _____________ 년 _____ 월 _____ 일    출고 일자: _____________ 년 _____ 월 _____ 일"),
        ("", ""),
        ("", "⊙ 고객"),
        ("", "고객명: _________________________________________________"),
        ("", "주소: _________________________________________________"),
        ("", "전화번호: _________________________________________________"),
        ("", ""),
        ("", "⊙ 공급자"),
        ("", "공급자명: _________________________________________________"),
        ("", "주소: _________________________________________________"),
        ("", "전화번호: _________________________________________________"),
        ("", ""),
        ("", "⊙ 수소 튜브트레일러 정보"),
        ("", "차량 번호: _______________    내용적: _______________ m³"),
        ("", ""),
        ("", "⊙ 거래 내역"),
        ("", "(1) 유량계 정산"),
        ("table", "입고 (A)|출고 (B)|||"),
        ("", "사용량: 출고 지침값 (B) - 입고 지침값 (A)"),
        ("", "사용량 A: ___________   사용량 B: ___________   합계: ___________"),
        ("", ""),
        ("", "(2) 차압 정산"),
        ("table", "입고 압력 (A) bar|출고 압력 (B) bar||"),
        ("", "사용량: ___________"),
        ("", "▶ 사용량 산정식: (출고 압력 - 입고 압력, bar) × 내용적 (m³)"),
        ("", ""),
        ("", "(3) 계량기 방식 (선택)"),
        ("", "충전전 중량: ___________ kg   충전후 중량: ___________ kg   충전량: ___________ kg"),
        ("", ""),
        ("", "⊙ 입출고 확인"),
        ("table", "구분|성명|서명|고객|||입고 기사|||출고 기사||"),
        ("", ""),
        ("", "(공급받는자 보관용)                                                    H2GO"),
    ]

    rtf = [r"{\rtf1\ansi\ansicpg949\deff0\uc1"]
    rtf.append(r"{\fonttbl{\f0\froman\fcharset0 Times New Roman;}{\f1\fnil\fcharset129 Arial;}}")
    rtf.append(r"\viewkind4\pard\f1\fs22")

    for kind, text in lines:
        if kind == "table":
            cells = text.split("|")
            rtf.append(r"\trowd\trgaph70\trleft-70")
            w = 2500
            for i in range(len(cells)):
                rtf.append(r"\clbrdrt\brdrw10\brdrs\clbrdrl\brdrw10\brdrs\clbrdrb\brdrw10\brdrs\clbrdrr\brdrw10\brdrs")
                rtf.append(f"\\cellx{(i+1)*w}")
            rtf.append(r"\pard\intbl")
            for c in cells:
                if c:
                    rtf.append(rtf_escape(c))
                rtf.append(r"\cell")
            rtf.append(r"\row")
        else:
            if text:
                rtf.append(rtf_escape(text))
            rtf.append(r"\par")

    rtf.append("}")
    content = "".join(rtf)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"완료: {output_path}")
    print("한글에서 열어 '다른 이름으로 저장' → HWP 형식으로 저장할 수 있습니다.")

if __name__ == "__main__":
    main()

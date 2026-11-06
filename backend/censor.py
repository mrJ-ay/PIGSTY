"""
PIGSTY Censor Bot (검열 봇) Engine
- 한국어 자음/모음 분해 (NFKD) 및 자모 결합 탐지
- 특수문자, 숫자, 공백 등 우회 삽입 탐지 (예: 시1발, ㅂㅕㅇ신, ㅅ1ㅂ, 개.새.끼)
- 욕설/비속어/모욕성 표현 필터링
- 음란성/선정적 키워드 필터링
"""

import re
import unicodedata
from typing import Optional, Tuple, Dict, Any, List

# 초성, 중성, 종성 테이블
CHOSUNG_LIST = [
    'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
]
JUNGSUNG_LIST = [
    'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
    'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
]
JONGSUNG_LIST = [
    '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
    'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
    'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
]

def decompose_hangul(text: str) -> str:
    """한글 음절을 자모 문자열로 분해합니다 (예: '시발' -> 'ㅅㅣㅂㅏㄹ')"""
    result = []
    for ch in text:
        code = ord(ch)
        if 0xAC00 <= code <= 0xD7A3:
            s_index = code - 0xAC00
            cho = s_index // (21 * 28)
            jung = (s_index % (21 * 28)) // 28
            jong = s_index % 28
            result.append(CHOSUNG_LIST[cho])
            result.append(JUNGSUNG_LIST[jung])
            if jong > 0:
                result.append(JONGSUNG_LIST[jong])
        else:
            result.append(ch)
    return "".join(result)


# =====================================================================
# 금칙어 사전
# =====================================================================

# 1. 욕설 / 비속어 / 비하
PROFANITY_KEYWORDS = [
    "시발", "씨발", "씨바", "ㅅㅂ", "ㅆㅂ", "tlqkf", "씨부랄", "씨발놈", "씨발년",
    "개새끼", "개색기", "개세끼", "개자식", "개련", "개년", "ㄱㅅㄲ", "개새",
    "병신", "븅신", "ㅂㅅ", "등신", "호구",
    "지랄", "ㅈㄹ", "지럴",
    "존나", "졸라", "ㅈㄴ", "존맛",  # 존맛은 예외처리 고려 필요하지만 비속어 패턴
    "새끼", "쌍놈", "쌍년", "썅",
    "닥쳐", "꺼져", "미친놈", "미친년", "미친새끼",
    "느금마", "니애미", "니애비", "엠창", "애미", "애비",
    "한남충", "한녀충", "틀딱", "홍어", "일베", "페미나치", "맘충",
    "죽어라", "나가죽어", "살인", "자살해",
]

# 2. 음란성 / 선정성
SEXUAL_KEYWORDS = [
    "섹스", "섹스하자", "야동", "조건만남", "폰섹", "원나잇", "몸캠",
    "자위", "성관계", "보지", "자지", "보빨", "자빨", "음경", "음순",
    "성인용품", "딜도", "오나홀", "딸딸이", "야설", "망가",
    "강간", "성폭행", "몰카", "성매매", "업소녀", "안마방", "립카페", "풀싸롱",
    "섹트", "일탈계", "오프만남", "라인녀", "텔레녀",
]

# 자주 우회되는 욕설 정규식 패턴 (숫자, 특수기호, 띄어쓰기 침투 대응)
# 예: 시1발, 시@발, ㅆ|발, ㅅㅣㅂㅏㄹ, ㅂ.ㅅ, ㅂㅕㅇ신
FUZZY_PATTERNS = [
    (re.compile(r"[시씨싀ㅅㅆ][\d\s\W_]*[발빨벌뻘바]"), "욕설/비속어 (시발 계열)"),
    (re.compile(r"[개게][\d\s\W_]*[새세색][\d\s\W_]*[끼키기]"), "욕설/비속어 (개새끼 계열)"),
    (re.compile(r"[병븅][\d\s\W_]*[신씬]"), "욕설/비속어 (병신 계열)"),
    (re.compile(r"[지찌][\d\s\W_]*[랄럴]"), "욕설/비속어 (지랄 계열)"),
    (re.compile(r"[존쥰][\d\s\W_]*[나낭나]"), "욕설/비속어 (존나 계열)"),
    (re.compile(r"[느니][\d\s\W_]*[금애][\d\s\W_]*[마미비]"), "패륜/비하 (가족 모욕)"),
    (re.compile(r"[섹섺][\d\s\W_]*[스쓰]"), "선정성 (음란 표현)"),
    (re.compile(r"[조쪼][\d\s\W_]*[건건][\d\s\W_]*[만맨][\d\s\W_]*[남남]"), "불법만남/선정성"),
    (re.compile(r"[몸몲][\d\s\W_]*[캠턤]"), "불법/선정성 (몸캠)"),
]

# 자모 분해 후 매칭할 패턴 (예: ㅂㅕㅇ신, ㅅㅣㅂㅏㄹ)
JAMO_PATTERNS = [
    (re.compile(r"ㅅ[\s\W_]*ㅣ[\s\W_]*ㅂ[\s\W_]*ㅏ[\s\W_]*ㄹ"), "욕설 (ㅅㅣㅂㅏㄹ)"),
    (re.compile(r"ㅆ[\s\W_]*ㅣ[\s\W_]*ㅂ[\s\W_]*ㅏ[\s\W_]*ㄹ"), "욕설 (ㅆㅣㅂㅏㄹ)"),
    (re.compile(r"ㅂ[\s\W_]*ㅕ[\s\W_]*ㅇ[\s\W_]*ㅅ[\s\W_]*ㅣ[\s\W_]*ㄴ"), "비하 (ㅂㅕㅇㅅㅣㄴ)"),
    (re.compile(r"ㄱ[\s\W_]*ㅐ[\s\W_]*ㅅ[\s\W_]*ㅐ[\s\W_]*ㄲ[\s\W_]*ㅣ"), "욕설 (ㄱㅐㅅㅐㄲㅣ)"),
    (re.compile(r"ㅈ[\s\W_]*ㅣ[\s\W_]*ㄹ[\s\W_]*ㅏ[\s\W_]*ㄹ"), "욕설 (ㅈㅣㄹㅏㄹ)"),
    (re.compile(r"ㅅ[\s\W_]*ㅔ[\s\W_]*ㄱ[\s\W_]*ㅅ[\s\W_]*ㅡ"), "선정성 (ㅅㅔㄱㅅㅡ)"),
    (re.compile(r"ㅅ[\s\W_]*ㅂ"), "초성 욕설 (ㅅㅂ)"),
    (re.compile(r"ㅆ[\s\W_]*ㅂ"), "초성 욕설 (ㅆㅂ)"),
    (re.compile(r"ㅂ[\s\W_]*ㅅ"), "초성 비하 (ㅂㅅ)"),
    (re.compile(r"ㅈ[\s\W_]*ㄹ"), "초성 욕설 (ㅈㄹ)"),
]


def clean_text(text: str) -> str:
    """특수문자와 공백, 숫자를 제거한 순수 한글/영문 텍스트 반환"""
    return re.sub(r"[^\w가-힣]", "", text)


def inspect_content(title: str, content: str, tags: str = "") -> Tuple[bool, Optional[str], Optional[str]]:
    """
    제목, 본문, 태그를 정밀 검사합니다.
    반환값: (위반 여부: bool, 감지 사유: str | None, 감지 키워드/패턴: str | None)
    """
    full_text = f"{title} {content} {tags}"
    cleaned = clean_text(full_text)
    jamo_text = decompose_hangul(full_text)

    # 1. 선정성 키워드 검사 (정확 일치 및 공백 제거 일치)
    for kw in SEXUAL_KEYWORDS:
        if kw in full_text or kw in cleaned:
            return True, "음란/선정적 표현 감지", kw

    # 2. 욕설/비하 키워드 검사 (단, '존맛' 등 긍정적 합성어 예외 고려)
    for kw in PROFANITY_KEYWORDS:
        if kw == "존맛":
            continue
        if kw in full_text or kw in cleaned:
            return True, "욕설 및 비하 표현 감지", kw

    # 3. 우회 정규식 패턴 검사 (특수문자/숫자 침투)
    for pattern, reason in FUZZY_PATTERNS:
        m = pattern.search(full_text)
        if m:
            return True, reason, m.group(0)

    # 4. 자모 분해 패턴 검사 (자모 분리 우회)
    for pattern, reason in JAMO_PATTERNS:
        m = pattern.search(jamo_text)
        if m:
            return True, reason, m.group(0)

    return False, None, None

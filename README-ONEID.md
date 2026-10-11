# PIGSTY ONEID 연결

PIGSTY 로그인은 ONEID로 진행합니다. 처음 연결할 때 기존 PIGSTY 아이디와 비밀번호를 한 번 확인하면 기존 회원 ID와 게시글 작성자 표시를 유지하면서 ONEID 닉네임으로 맞춥니다. 새 계정은 ONEID 닉네임으로 PIGSTY 프로필을 만듭니다.

## 로컬 개발

ONEID는 `http://127.0.0.1:8000`, PIGSTY 프론트엔드는 `http://127.0.0.1:5502/` callback으로 설정되어 있습니다. `frontend/oneid-config.js`에서 ONEID 주소를 바꿀 수 있습니다. PIGSTY 백엔드에는 `ONEID_API_URL`을 설정하세요.

## 배포

ONEID의 `ONEID_CLIENT_REDIRECT_URIS`에 PIGSTY의 정확한 공개 callback URL을 `pigsty` client로 등록하고 `ONEID_ALLOWED_ORIGINS`에 PIGSTY origin을 추가하세요. PIGSTY API 서버에도 HTTPS인 `ONEID_API_URL`과 충분히 긴 무작위 `PIGSTY_SECRET_KEY`를 설정해야 합니다. 운영용 callback 주소는 로컬 개발 허용 목록에 자동 등록되지 않으므로 배포 주소를 직접 추가하세요.
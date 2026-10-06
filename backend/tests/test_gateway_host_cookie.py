from backend.gateway import response_headers

def test_host_cookie_keeps_root_and_media_cookie_is_service_scoped():
    headers = response_headers([
        (b'set-cookie', b'__Host-wiameet_session=example; Path=/; Secure; HttpOnly'),
        (b'set-cookie', b'wiameet_media_session=example; Path=/api; Secure; HttpOnly'),
    ], '/wiameet', 'https://axforwork.wia.co.kr:31001', 'axforwork.wia.co.kr')
    assert headers == [
        (b'set-cookie', b'__Host-wiameet_session=example; Path=/; Secure; HttpOnly'),
        (b'set-cookie', b'wiameet_media_session=example; Path=/wiameet/api; Secure; HttpOnly'),
    ]

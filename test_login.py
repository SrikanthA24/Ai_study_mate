#!/usr/bin/env python3
import json
import urllib.request
import urllib.error

def test_login():
    url = 'http://localhost:8000/api/auth/login'
    headers = {'Content-Type': 'application/json'}
    data = json.dumps({'email': 'test@example.com', 'password': 'Pass12345'})
    
    print("\n=== LOGIN TEST ===\n")
    print("Testing Login Endpoint")
    print(f"URL: {url}")
    print(f"Data: {data}")
    print("-" * 50)
    
    req = urllib.request.Request(url, data=data.encode(), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            print(f'✓ Status: {response.status}')
            resp_data = response.read().decode()
            print(f'Response: {resp_data}')
            
            # Parse to see token
            resp_json = json.loads(resp_data)
            if 'access_token' in resp_json:
                print(f"\n✓ Token received (length: {len(resp_json['access_token'])} chars)")
                print(f"Token type: {resp_json.get('token_type', 'N/A')}")
            return True
    except urllib.error.HTTPError as e:
        print(f'✗ Status: {e.code}')
        try:
            error_data = e.read().decode()
            print(f'Error Response: {error_data}')
        except:
            print(f'Error: {e}')
        return False
    except Exception as e:
        print(f'✗ Exception: {e}')
        import traceback
        traceback.print_exc()
        return False

def test_with_invalid_credentials():
    url = 'http://localhost:8000/api/auth/login'
    headers = {'Content-Type': 'application/json'}
    data = json.dumps({'email': 'test@example.com', 'password': 'WrongPassword'})
    
    print("\n=== LOGIN WITH WRONG PASSWORD ===\n")
    print("Testing Login with Invalid Credentials")
    print(f"URL: {url}")
    print("-" * 50)
    
    req = urllib.request.Request(url, data=data.encode(), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            print(f'Unexpected Success: {response.status}')
            return False
    except urllib.error.HTTPError as e:
        if e.code == 401:
            print(f'✓ Correctly rejected with 401 Unauthorized')
            error_data = e.read().decode()
            print(f'Error Response: {error_data}')
            return True
        else:
            print(f'✗ Unexpected Status: {e.code}')
            return False
    except Exception as e:
        print(f'✗ Exception: {e}')
        return False

if __name__ == '__main__':
    test_login()
    test_with_invalid_credentials()
    print("\n✅ All auth tests completed!")

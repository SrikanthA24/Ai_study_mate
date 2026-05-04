#!/usr/bin/env python3
import sys
import json
import urllib.request
import urllib.error

def test_registration():
    url = 'http://localhost:8000/api/auth/register'
    headers = {'Content-Type': 'application/json'}
    data = json.dumps({'email': 'test@example.com', 'password': 'Pass12345'})
    
    print("Testing Registration Endpoint")
    print(f"URL: {url}")
    print(f"Data: {data}")
    print("-" * 50)
    
    req = urllib.request.Request(url, data=data.encode(), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            print(f'✓ Status: {response.status}')
            resp_data = response.read().decode()
            print(f'Response: {resp_data}')
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

def test_health():
    url = 'http://localhost:8000/health'
    print("Testing Health Endpoint")
    print(f"URL: {url}")
    print("-" * 50)
    
    try:
        with urllib.request.urlopen(url) as response:
            print(f'✓ Status: {response.status}')
            resp_data = response.read().decode()
            print(f'Response: {resp_data}')
            return True
    except Exception as e:
        print(f'✗ Error: {e}')
        return False

if __name__ == '__main__':
    print("\n=== HEALTH CHECK ===\n")
    if test_health():
        print("\n=== REGISTRATION TEST ===\n")
        test_registration()
    else:
        print("Backend is not responding!")
        sys.exit(1)

import requests

url = "https://renewal-incentive-1.onrender.com/predict"
payload = {
"data":[
    [

    ]
]

}
result = requests.post(url=url,json=payload)
print(result.status_code)
print(result.json())
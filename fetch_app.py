import requests

url = "https://insurance-incentive-prediction.onrender.com/predict"
payload = {
"data":[
    [
       0.97,16800,360050,0.0,0.0,0.0,99.7,9,"D","Urban",3300
    ],
    [
       0.629,12060,217640,1.0,0.0,1.0,98.81,15,"D","Rural",22200 
    ],
    [
       1.0,15702,45140,0.0,0.0,0.0,0,2,"B","Rural",5700 
    ]
]

}
result = requests.post(url=url,json=payload)
print(result.status_code)
print(result.json())
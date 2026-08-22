import pandas as pd
import joblib
import numpy as np
import warnings
warnings.filterwarnings("ignore")
from fastapi import FastAPI, HTTPException 
from pydantic import BaseModel
from typing import List
import logging
app = FastAPI()

class RevenueRenewal(BaseModel):
    data : list[list]

def agent_effort(I):
    return 10*(1-np.exp(-I/400))
def agent_proba(eff):
    return 0.20*(1-np.exp(-eff/5))
def rev(premium, probability, agent_prob, I):
    return premium * (probability + agent_prob)-I

@app.post("/predict")
def run_insurance(request: RevenueRenewal):
    try:
        data = request.data
        data = pd.DataFrame(data, columns=['perc_premium_paid_by_cash_credit', 'age_in_days', 'Income',
            'Count_3-6_months_late','Count_6-12_months_late','Count_more_than_12_months_late', 'application_underwriting_score','no_of_premiums_paid','sourcing_channel','residence_area_type' ,'premium' ])
        imputer = joblib.load("Parth_Imputer.pkl")
        # num_col = data.describe().columns
        num_col = list(data.select_dtypes(include="number").columns)
        data[num_col]=imputer.transform(data[num_col])
        data["Total_late"] =data['Count_3-6_months_late']+data['Count_6-12_months_late']+data['Count_more_than_12_months_late']


        model = joblib.load("renewal_pipeline.pkl")
        prediction=model.predict_proba(data[['perc_premium_paid_by_cash_credit', 'age_in_days', 'Income',
            'Total_late', 'application_underwriting_score','no_of_premiums_paid', 'premium', 'residence_area_type','sourcing_channel']])


        premium = list(data["premium"])
        max_rev=[]
        for j in range(len(premium)):
            pre=premium[j]
            base_prob=prediction[j][1]
            base_line = base_prob * pre
            incentive = 0
            for i in range(500,5000,500):
                eff = agent_effort(i)
                prob = agent_proba(eff)
                revenue = rev(pre,base_prob,prob,i)
                if base_line < revenue:
                    base_line = revenue
                    incentive = i
            max_rev.append(
                {
                    "premium" : pre,
                    "revenue" : revenue,
                    "incentive" : incentive
                }
            )
        return({"Result": max_rev})
    except Exception as e:
        raise HTTPException(status_code=500,detail=str(e))




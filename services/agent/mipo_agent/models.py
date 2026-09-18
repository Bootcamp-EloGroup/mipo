from typing import Literal
from pydantic import BaseModel, ConfigDict
Risk=Literal["size","quality","preference_mismatch","none","insufficient_evidence"]
class Variant(BaseModel):
 id:str; size:Literal["P","M","G","GG"]|None=None; returnRate:float; defectRate:float; inventory_quantity:int|None=None; salesCount:int|None=None; evidenceOrigin:Literal["provided","derived","synthetic"]|None=None
class Product(BaseModel):
 id:str; title:str; category:str; variants:list[Variant]; productKind:str|None=None; variantAttribute:str|None=None; alternativeProductId:str|None=None
class Thresholds(BaseModel):
 highReturnRate:float; minimumImprovement:float; lowStockQuantity:int; minimumSampleSize:int
class RiskResult(BaseModel):
 risk:Risk; level:Literal["high","medium","low"]; evidence:str; message:str; recommendedVariant:Variant|None=None; alternativeProductId:str|None=None; outcome:Literal["good_match","partial_match","attention","insufficient_evidence"]="good_match"; matchedPreferences:list[str]=[]; mismatchedPreferences:list[str]=[]
class AgentRequest(BaseModel):
 model_config=ConfigDict(extra="forbid")
 interventionId:str; product:Product; selected:Variant; fitPreference:Literal["fitted","regular","loose"]; thresholds:Thresholds; deterministicResult:RiskResult; selectionContext:dict[str,object]|None=None
class AgentAnswer(BaseModel):
 action:Literal["explain_evidence","present_authorized_alternative","suggest_add_to_cart","no_intervention"]
 message:str
 rationaleCode:Literal["size_context","quality_context","preference_context","insufficient_sample","no_risk"]
 provider:Literal["eloagents","groq","deterministic"]
 model:str
 status:Literal["eloagents_succeeded","groq_succeeded","deterministic_fallback","rejected_by_policy"]

class AgentStep(BaseModel):
 stepNumber:int
 attemptNumber:int=1
 provider:Literal["python","eloagents","groq"]
 kind:Literal["tool_call","final_answer"]
 toolName:str|None=None
 status:Literal["succeeded","failed","rejected"]
 durationMs:int
 failureReason:str|None=None

class AgentExecution(BaseModel):
 answer:AgentAnswer
 steps:list[AgentStep]
 failureReason:Literal["timeout","provider_unavailable","invalid_output","policy_rejected"]|None=None

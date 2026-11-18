from tools.tavily_tool import tavily_search 
from tools.flight_tool import search_flights
from backend import run_travel_agent
# result = tavily_search("Plan a 7 days Japan trip from Bangladesh")
# print(result)
# result = tavily_search("Best hotels in Egypt")
# print(result)

user_input = input("Enter travel request: ")
response = run_travel_agent(
    user_input=user_input,
    thread_id="test_user"
)

print("\nFINAL RESPONSE:\n")
print(response["answer"])
# Plan a 5-day trip from Cairo to Istanbul under $1500

// Sample code from https://developer.salesforce.com/page/Apex_Code_Best_Practices
trigger sampleTrigger on Account (before insert, before update) {

   List<String> accountNames = new List<String>{};
 
   //Loop through all records in the Trigger.new collection
   for(Account a: Trigger.new){
      //Concatenate the Name and billingState into the Description field
      a.Description = a.Name + ':' + a.BillingState;
   }
   
}
